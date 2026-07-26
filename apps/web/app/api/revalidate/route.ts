import { createHmac, timingSafeEqual } from "node:crypto";
import { type RevalidatePayload, tagsForEntry } from "@vng/shared";
import { revalidatePath, revalidateTag } from "next/cache";
import { type NextRequest, NextResponse } from "next/server";

/**
 * On-demand revalidation webhook receiver (§5.3).
 *
 * Flow: Strapi lifecycle → signed POST here → verify HMAC → map the changed
 * entry to §5.2 cache tags → `revalidateTag()` (+ `revalidatePath()` for the
 * detail routes). Because the cache is Redis-backed (`cache-handler.mjs`), the
 * revalidation is cluster-wide: every web instance sees it, not just this one.
 *
 * This route does NOT rebuild or redeploy — it only marks cache tags stale, so
 * the next request regenerates from the CMS. Content freshness with zero build.
 *
 * Runs on the Node runtime (needs `node:crypto`) and is never cached itself.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIGNATURE_HEADER = "x-vng-signature";

/**
 * Constant-time compare of the `sha256=<hex>` signature against a fresh HMAC of
 * the raw body. Rejects unsigned / mismatched / malformed signatures — a
 * length mismatch is caught before `timingSafeEqual` (which throws on unequal
 * buffer lengths).
 */
function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Extra route paths to bust alongside tags (§5.3 "revalidateTag()/revalidatePath()").
 * Tags already invalidate the pages that fetched the data, but revalidating the
 * canonical detail path is a cheap belt-and-suspenders for the highest-traffic
 * routes.
 */
function pathsForEntry(p: RevalidatePayload): string[] {
  if (!p.slug || !p.locale) return [];
  switch (p.model) {
    case "article":
      return [`/${p.locale}/tin-tuc/${p.slug}`];
    case "landing-page":
      return [`/${p.locale}/${p.slug}`];
    default:
      return [];
  }
}

export async function POST(req: NextRequest) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    // Misconfiguration, not a client error — fail loud so it's noticed.
    console.error("[revalidate] REVALIDATE_SECRET is not set — refusing all requests");
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  // Read the raw body BEFORE parsing — the HMAC is over the exact bytes sent.
  const rawBody = await req.text();
  const signature = req.headers.get(SIGNATURE_HEADER);

  if (!verifySignature(rawBody, signature, secret)) {
    console.warn("[revalidate] rejected request with invalid/missing signature");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: RevalidatePayload;
  try {
    payload = JSON.parse(rawBody) as RevalidatePayload;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  if (!payload?.model) {
    return NextResponse.json({ error: "missing model" }, { status: 400 });
  }

  const tags = tagsForEntry(payload);
  const paths = pathsForEntry(payload);

  // Idempotent: revalidating the same tag twice is a no-op; the cache handler
  // just re-stamps the tag's invalidation timestamp.
  //
  // Next 16 requires the second arg. `{ expire: 0 }` means *immediate*
  // invalidation (Next core treats `expire === 0` as the immediate path, and
  // our cache handler stamps `expired = now`), so the very next request on any
  // instance regenerates — this is what delivers < ~2s freshness rather than a
  // deferred stale-while-revalidate. Passing an object also avoids the
  // single-arg deprecation warning.
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  for (const path of paths) revalidatePath(path);

  console.info(
    `[revalidate] model=${payload.model} documentId=${payload.documentId ?? "-"} ` +
      `locale=${payload.locale ?? "-"} slug=${payload.slug ?? "-"} ` +
      `tags=[${tags.join(",")}] paths=[${paths.join(",")}]`,
  );

  return NextResponse.json({
    revalidated: true,
    model: payload.model,
    tags,
    paths,
    now: Date.now(),
  });
}
