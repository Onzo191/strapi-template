/**
 * S3 → ClamAV virus-scan Lambda (Req §2, §0 A6 — Mode B in
 * `apps/cms/src/upload/virus-scan.ts`).
 *
 * Triggered by `s3:ObjectCreated:*` on the media bucket. Streams the object to a
 * `clamd` daemon, then POSTs a signed verdict to the CMS, which deletes the file
 * (library row + S3 object) and writes an immutable audit entry if it is infected.
 *
 * ## Packaging
 *
 * Deploy as a **container image** Lambda built from `Dockerfile` in this
 * directory, not a zip. ClamAV's engine plus its signature database is ~300 MB,
 * well past the 250 MB unzipped zip limit, and the container image also lets
 * `freshclam` run at build time so cold starts don't wait on a signature
 * download.
 *
 * Keep signatures current by rebuilding and redeploying the image on a schedule
 * (a nightly pipeline job) — a scanner with a three-month-old database is a
 * false sense of security, which is worse than none.
 *
 * ## Sizing
 *
 *   memory: 3008 MB   (clamd needs ~1.5 GB resident for the signature DB;
 *                      more memory also buys proportionally more CPU)
 *   timeout: 300 s
 *   ephemeral storage: 1024 MB
 *
 * ## Environment
 *
 *   CMS_CALLBACK_URL             https://cms.internal/api/upload-scan/callback
 *   UPLOAD_SCAN_CALLBACK_SECRET  same value as the CMS's (from Secrets Manager)
 *   CLAMD_HOST / CLAMD_PORT      127.0.0.1 / 3310 (the sidecar in this image)
 *   MAX_OBJECT_BYTES             skip objects larger than this (default 100 MB)
 *
 * ## IAM (least privilege)
 *
 *   s3:GetObject      on arn:aws:s3:::<media-bucket>/*     — read to scan
 *   kms:Decrypt       on the bucket's CMK, if SSE-KMS
 *
 * Deliberately **no** `s3:DeleteObject`: deletion goes through the CMS so the
 * library row and the object are removed together and the deletion is audited.
 * A Lambda that could delete objects directly would leave the CMS pointing at
 * missing media, with no audit trail.
 */
import { createHmac } from "node:crypto";
import { connect } from "node:net";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const s3 = new S3Client({});

const CLAMD_HOST = process.env.CLAMD_HOST ?? "127.0.0.1";
const CLAMD_PORT = Number(process.env.CLAMD_PORT ?? 3310);
const MAX_OBJECT_BYTES = Number(process.env.MAX_OBJECT_BYTES ?? 100 * 1024 * 1024);
const CHUNK_SIZE = 64 * 1024;

/** Must match `packages/shared/src/security/signature.ts`. */
const SIGNATURE_HEADER = "x-vng-signature";
const TIMESTAMP_HEADER = "x-vng-timestamp";

/**
 * Canonical signing string — must match `canonicalPayload` in
 * `apps/cms/src/api/upload-scan/controllers/upload-scan.ts`. Field order is part
 * of the contract; changing it on one side silently breaks authentication on the
 * other, so both sides carry this comment.
 */
function canonicalPayload({ status, key, fileHash, signature }) {
  return [status ?? "", key ?? "", fileHash ?? "", signature ?? ""].join("\n");
}

function scanBuffer(buffer) {
  return new Promise((resolve) => {
    let settled = false;
    const socket = connect({ host: CLAMD_HOST, port: CLAMD_PORT });
    const chunks = [];

    const finish = (verdict) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(verdict);
    };

    socket.setTimeout(120_000);
    socket.on("timeout", () => finish({ status: "error", signature: "clamd timeout" }));
    socket.on("error", (err) => finish({ status: "error", signature: err.message }));

    socket.on("data", (data) => {
      chunks.push(data);
      if (data.includes(0)) finish(parseReply(Buffer.concat(chunks).toString("utf8")));
    });
    socket.on("close", () => {
      if (chunks.length > 0) finish(parseReply(Buffer.concat(chunks).toString("utf8")));
      else finish({ status: "error", signature: "clamd closed without a reply" });
    });

    socket.on("connect", () => {
      socket.write("zINSTREAM\0");
      for (let offset = 0; offset < buffer.length; offset += CHUNK_SIZE) {
        const chunk = buffer.subarray(offset, offset + CHUNK_SIZE);
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      }
      socket.write(Buffer.alloc(4));
    });
  });
}

function parseReply(reply) {
  const line = reply.replace(/\0/g, "").trim();
  if (/\bOK$/.test(line)) return { status: "clean" };
  const found = /^stream:\s*(.+?)\s+FOUND$/.exec(line);
  if (found) return { status: "infected", signature: found[1] };
  return { status: "error", signature: line || "empty clamd reply" };
}

async function report({ key, fileHash, status, signature }) {
  const url = process.env.CMS_CALLBACK_URL;
  const secret = process.env.UPLOAD_SCAN_CALLBACK_SECRET;
  if (!url || !secret) {
    throw new Error("CMS_CALLBACK_URL and UPLOAD_SCAN_CALLBACK_SECRET must both be set");
  }

  const body = { key, fileHash, status, signature };
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const hmac = createHmac("sha256", secret)
    .update(`${timestamp}.${canonicalPayload(body)}`)
    .digest("hex");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      [SIGNATURE_HEADER]: `sha256=${hmac}`,
      [TIMESTAMP_HEADER]: timestamp,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Throwing puts the event back on Lambda's retry path. An unreported
    // *infected* verdict is the one outcome we must not swallow.
    throw new Error(`CMS callback failed: ${res.status} ${res.statusText}`);
  }
}

/** `uploads/my_image_abc123.png` → `my_image_abc123` (Strapi's file `hash`). */
function deriveHash(key) {
  const base = key.split("/").pop() ?? key;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
}

export async function handler(event) {
  for (const record of event.Records ?? []) {
    // S3 event keys are URL-encoded (spaces become `+`).
    const bucket = record.s3?.bucket?.name;
    const key = decodeURIComponent((record.s3?.object?.key ?? "").replace(/\+/g, " "));
    const size = Number(record.s3?.object?.size ?? 0);
    if (!bucket || !key) continue;

    const fileHash = deriveHash(key);

    if (size > MAX_OBJECT_BYTES) {
      // Report rather than skip silently: the CMS records the file as
      // `status: "error"`, so "too big to scan" is visible in the library
      // instead of looking like a clean file.
      console.warn(`[virus-scan] ${key} is ${size} bytes — above the scan limit`);
      await report({
        key,
        fileHash,
        status: "error",
        signature: `object exceeds MAX_OBJECT_BYTES (${size} > ${MAX_OBJECT_BYTES})`,
      });
      continue;
    }

    let buffer;
    try {
      const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      buffer = Buffer.from(await object.Body.transformToByteArray());
    } catch (err) {
      console.error(`[virus-scan] could not read s3://${bucket}/${key}: ${err.message}`);
      await report({ key, fileHash, status: "error", signature: `s3 read failed: ${err.message}` });
      continue;
    }

    const verdict = await scanBuffer(buffer);
    console.log(`[virus-scan] ${key} → ${verdict.status} ${verdict.signature ?? ""}`);
    await report({ key, fileHash, status: verdict.status, signature: verdict.signature });
  }

  return { ok: true };
}
