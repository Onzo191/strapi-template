import { createRedirectResolver, safeRedirect } from "@vng/shared";
import { type NextRequest, NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

const intlMiddleware = createMiddleware(routing);

/**
 * 301/302 resolver for the legacy-404 map (§6.3, Req §6). Runs before locale
 * routing so old URLs redirect to their new home. Fails open (see the resolver)
 * so a CMS outage never breaks navigation; the full table is cached in-module
 * with a short TTL, so this is a `Map` lookup on the hot path.
 */
const redirects = createRedirectResolver({
  baseUrl: process.env.STRAPI_URL ?? "http://localhost:1337",
  apiToken: process.env.STRAPI_API_TOKEN,
});

export default async function proxy(request: NextRequest) {
  const hit = await redirects.resolve(request.nextUrl.pathname);
  if (hit) {
    // `to`/`statusCode` are editor-authored (and the redirect importer can write
    // them without passing Strapi's validators at all), so they are checked
    // before becoming a `Location`:
    //  - `safeRedirect` rejects `javascript:`/`data:` targets, so a redirect row
    //    can never be a script sink.
    //  - It also pins the status to one `NextResponse.redirect` accepts. The
    //    schema allows 300–399, but 350 would throw a `RangeError` *inside
    //    middleware* — which fails every request for that path, not just the
    //    redirect. Falling back beats 500-ing.
    // An unusable row falls through to normal routing rather than erroring.
    const safe = safeRedirect(hit.to, hit.statusCode);
    if (safe) {
      return NextResponse.redirect(new URL(safe.to, request.url), safe.statusCode);
    }
    console.warn(`[redirects] ignoring unsafe redirect target for ${request.nextUrl.pathname}`);
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
