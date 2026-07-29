import { timingSafeEqual } from "node:crypto";
import { safePreviewPath } from "@vng/shared";
import { draftMode } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { clientKey, rateLimit } from "@/lib/rate-limit";

/**
 * Draft preview entry (§6.3). Strapi's native Content Preview links here with a
 * shared `secret` and the target FE `url`. We verify the secret, enable Next
 * `draftMode` (a signed cookie), and redirect to the page — which then fetches
 * draft content via the preview token (see the strapi client `preview` flag).
 *
 * This route is the only thing standing between the public internet and
 * unpublished content — embargoed press releases, financial results before
 * disclosure. P7 hardening reflects that:
 *  - **Constant-time secret compare.** A `!==` on a secret leaks its length and
 *    a byte-by-byte timing signal; over enough samples that is recoverable.
 *  - **Rate limit.** 10 attempts/minute/IP makes online brute force useless
 *    while never inconveniencing a real editor, who arrives with a valid link.
 *  - **Path-only destination.** `safePreviewPath` requires a leading single `/`,
 *    so neither `//evil.com` nor an absolute URL can turn this into an open
 *    redirect that launders our domain's reputation.
 *  - **No secret echo.** The redirect target never carries the secret onward, so
 *    it cannot leak via `Referer` (already narrowed by `Referrer-Policy`) or an
 *    editor pasting the resulting URL into a ticket.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT = Number(process.env.PREVIEW_RATE_LIMIT ?? 10);
const RATE_WINDOW_MS = 60_000;

/**
 * Constant-time equality that does not leak length. `timingSafeEqual` throws on
 * unequal buffers, so the length check has to come first — comparing lengths is
 * itself a (small) leak, which is why the caller also rate-limits.
 */
function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  const expected = process.env.PREVIEW_SECRET;
  if (!expected) {
    // Preview disabled by configuration. 404 rather than 500: an unconfigured
    // feature should look absent, not broken.
    return new NextResponse("Not found", { status: 404 });
  }

  const limit = rateLimit(`preview:${clientKey(request.headers)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!limit.ok) {
    return new NextResponse("Too many requests", {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfter) },
    });
  }

  const params = request.nextUrl.searchParams;

  if (!secretMatches(params.get("secret"), expected)) {
    return new NextResponse("Invalid preview token", { status: 401 });
  }

  // Only ever redirect to a same-origin path (no open redirect).
  const path = safePreviewPath(params.get("url") ?? "/");
  if (!path) {
    return new NextResponse("Invalid preview url", { status: 400 });
  }

  (await draftMode()).enable();
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}
