import { draftMode } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Draft preview entry (§6.3). Strapi's native Content Preview links here with a
 * shared `secret` and the target FE `url`. We verify the secret, enable Next
 * `draftMode` (a signed cookie), and redirect to the page — which then fetches
 * draft content via the preview token (see the strapi client `preview` flag).
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const secret = params.get("secret");

  if (!process.env.PREVIEW_SECRET || secret !== process.env.PREVIEW_SECRET) {
    return new NextResponse("Invalid preview token", { status: 401 });
  }

  // Only ever redirect to a same-origin path (no open redirect).
  const dest = new URL(params.get("url") ?? "/", request.nextUrl.origin);
  if (dest.origin !== request.nextUrl.origin) {
    return new NextResponse("Invalid preview url", { status: 400 });
  }

  (await draftMode()).enable();
  return NextResponse.redirect(dest);
}
