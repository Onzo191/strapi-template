import { createRedirectResolver } from "@vng/shared";
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
    return NextResponse.redirect(new URL(hit.to, request.url), hit.statusCode);
  }
  return intlMiddleware(request);
}

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
