import { draftMode } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

/** Exit draft preview (§6.3) — disable draftMode and return to the given page. */
export async function GET(request: NextRequest) {
  (await draftMode()).disable();
  const dest = new URL(request.nextUrl.searchParams.get("url") ?? "/", request.nextUrl.origin);
  return NextResponse.redirect(
    dest.origin === request.nextUrl.origin ? dest : new URL("/", request.nextUrl.origin),
  );
}
