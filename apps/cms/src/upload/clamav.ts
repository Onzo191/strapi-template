/**
 * Minimal `clamd` client speaking the INSTREAM command (Req §2 upload scanning,
 * §0 A6).
 *
 * Written by hand rather than pulled from npm on purpose: the wire protocol is
 * ~40 lines, and a scanner sitting in the request path of every editor upload is
 * exactly the kind of dependency you want to be able to read end-to-end during a
 * security review. `clamd` runs as a sidecar container in the CMS's ECS task
 * definition (or `clamav/clamav` locally), reachable on `CLAMAV_HOST:CLAMAV_PORT`.
 *
 * ## Protocol
 *
 *   → "zINSTREAM\0"
 *   → for each chunk: <uint32be length><bytes>
 *   → <uint32be 0>                      (end of stream)
 *   ← "stream: OK\0"                    clean
 *   ← "stream: <Signature> FOUND\0"     infected
 *   ← "... ERROR\0"                     scanner-side failure
 *
 * `z` prefix = NUL-terminated reply, which is easier to frame than the newline
 * variant when a signature name itself contains a newline.
 */
import { connect, type Socket } from "node:net";

/** clamd's own default is 25 MiB (`StreamMaxLength`); chunk well under it. */
const CHUNK_SIZE = 64 * 1024;

export type ScanVerdict =
  | { status: "clean" }
  | { status: "infected"; signature: string }
  | { status: "error"; message: string };

export interface ClamAvConfig {
  host: string;
  port: number;
  /** Whole-scan deadline. An editor waiting on an upload will not wait forever. */
  timeoutMs: number;
}

export function clamAvConfigFromEnv(): ClamAvConfig | null {
  const host = process.env.CLAMAV_HOST?.trim();
  if (!host) return null;
  return {
    host,
    port: Number(process.env.CLAMAV_PORT ?? 3310),
    timeoutMs: Number(process.env.CLAMAV_TIMEOUT_MS ?? 30_000),
  };
}

function parseReply(reply: string): ScanVerdict {
  const line = reply.replace(/\0/g, "").trim();
  if (/\bOK$/.test(line)) return { status: "clean" };
  const found = /^stream:\s*(.+?)\s+FOUND$/.exec(line);
  if (found) return { status: "infected", signature: found[1] };
  return { status: "error", message: line || "empty reply from clamd" };
}

/**
 * Scan a buffer. Resolves with a verdict; never rejects — a scanner problem is a
 * `status: "error"` verdict so the caller can apply its own fail-open/closed
 * policy rather than having an exception decide it by accident.
 */
export function scanBuffer(buffer: Buffer, config: ClamAvConfig): Promise<ScanVerdict> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (verdict: ScanVerdict) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(verdict);
    };

    let socket: Socket;
    try {
      socket = connect({ host: config.host, port: config.port });
    } catch (err) {
      resolve({ status: "error", message: (err as Error).message });
      return;
    }

    socket.setTimeout(config.timeoutMs);
    socket.on("timeout", () => finish({ status: "error", message: "clamd scan timed out" }));
    socket.on("error", (err) => finish({ status: "error", message: err.message }));

    const chunks: Buffer[] = [];
    socket.on("data", (data: Buffer) => {
      chunks.push(data);
      // clamd NUL-terminates the z-prefixed reply, so that byte frames it.
      if (data.includes(0)) {
        finish(parseReply(Buffer.concat(chunks).toString("utf8")));
      }
    });
    socket.on("close", () => {
      if (chunks.length > 0) finish(parseReply(Buffer.concat(chunks).toString("utf8")));
      else finish({ status: "error", message: "clamd closed the connection without a reply" });
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
      // Zero-length chunk = end of stream.
      socket.write(Buffer.alloc(4));
    });
  });
}

/** Liveness probe (`PING` → `PONG`) used by the bootstrap sanity check. */
export function ping(config: ClamAvConfig): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host: config.host, port: config.port });
    const done = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(Math.min(5000, config.timeoutMs));
    socket.on("timeout", () => done(false));
    socket.on("error", () => done(false));
    socket.on("connect", () => socket.write("zPING\0"));
    socket.on("data", (data: Buffer) => done(data.toString("utf8").includes("PONG")));
  });
}
