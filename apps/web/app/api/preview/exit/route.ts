import { safePreviewPath } from "@vng/shared";
import { draftMode } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Exit draft preview (§6.3) — disable draftMode and return to the given page.
 *
 * Unauthenticated by design (leaving preview is never privileged), but the
 * destination goes through the same `safePreviewPath` check as the entry route:
 * an unauthenticated open redirect on our own domain is still an open redirect,
 * and this one would be trivially discoverable. An unusable `url` falls back to
 * the home page rather than erroring — the visitor's draft cookie is already
 * cleared by then, which is the part that matters.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  (await draftMode()).disable();
  const path = safePreviewPath(request.nextUrl.searchParams.get("url")) ?? "/";
  return NextResponse.redirect(new URL(path, request.nextUrl.origin));
}
