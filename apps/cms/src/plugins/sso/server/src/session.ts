/**
 * Mint a Strapi admin session for an SSO-authenticated user.
 *
 * Strapi 5.51 issues admin sessions through `strapi.sessionManager('admin')`:
 * `generateRefreshToken` → httpOnly `strapi_admin_refresh` cookie →
 * `generateAccessToken` → the short-lived JWT the admin SPA sends as a bearer.
 * The local login controller does exactly this
 * (`@strapi/admin/.../controllers/authentication.ts`), and reusing the same
 * manager means SSO sessions inherit **every** lifetime we tightened in
 * `config/admin.ts` — 15 min access token, 30 min idle, 8 h absolute — instead of
 * being a parallel session mechanism that quietly ignores them.
 *
 * The cookie options are rebuilt here rather than imported from
 * `@strapi/admin/dist/server/shared/utils/session-auth`, which is not a public
 * entry point; the values are derived from the same `admin.auth.cookie.*` config
 * keys, so they stay consistent with the local-login path by construction.
 *
 * Two cookies are set, matching what Strapi's own EE SSO does:
 *  - `strapi_admin_refresh` — httpOnly, the actual session credential;
 *  - the access-token cookie (`admin.auth.cookie.name`, default `jwtToken`,
 *    scoped to `/admin`) — **not** httpOnly, because the admin SPA has to read it
 *    to populate its Redux store on a cold load. `getStoredToken()` in the
 *    admin's `reducer.ts` reads `localStorage.jwtToken` and falls back to exactly
 *    this cookie, which is what makes a server-side SSO redirect land the user in
 *    an authenticated panel with no bespoke handoff page.
 */
import type { Core } from "@strapi/strapi";
import { uuidv7 } from "@vng/shared";

const REFRESH_COOKIE_NAME = "strapi_admin_refresh";
const DEFAULT_ACCESS_COOKIE_NAME = "jwtToken";
const DEFAULT_ACCESS_COOKIE_PATH = "/admin";

type SessionManager = (origin: string) => {
  generateRefreshToken: (
    userId: string,
    deviceId: string,
    options?: { type?: "refresh" | "session"; metadata?: unknown },
  ) => Promise<{ token: string; absoluteExpiresAt?: string }>;
  generateAccessToken: (refreshToken: string) => Promise<{ token: string } | { error: string }>;
};

interface CookieCapableCtx {
  cookies: { set: (name: string, value: string | null, options?: Record<string, unknown>) => void };
  request: { secure: boolean; headers: Record<string, string | string[] | undefined> };
}

function cookieBase(strapi: Core.Strapi, secureRequest: boolean) {
  const configured = strapi.config.get("admin.auth.cookie.secure") as boolean | undefined;
  const isProduction = process.env.NODE_ENV === "production";
  return {
    domain:
      (strapi.config.get("admin.auth.cookie.domain") as string | undefined) ||
      (strapi.config.get("admin.auth.domain") as string | undefined) ||
      undefined,
    path: (strapi.config.get("admin.auth.cookie.path") as string) || DEFAULT_ACCESS_COOKIE_PATH,
    sameSite: (strapi.config.get("admin.auth.cookie.sameSite") as string) ?? "lax",
    secure: typeof configured === "boolean" ? configured : isProduction && secureRequest,
  };
}

export interface MintedSession {
  accessToken: string;
}

/**
 * Create the session and set both cookies on `ctx`.
 *
 * `type: "session"` (not `"refresh"`) is deliberate: it produces a browser
 * *session* cookie with no `Expires`, so closing the browser ends the CMS
 * session. SSO users re-authenticate through the IdP — which is fast, and which
 * is where MFA and any conditional-access policy actually get re-evaluated. A
 * persistent "remember me" cookie would bypass that re-evaluation for its whole
 * lifetime.
 */
export async function mintAdminSession(
  strapi: Core.Strapi,
  ctx: CookieCapableCtx,
  userId: number | string,
): Promise<MintedSession> {
  const sessionManager = (strapi as unknown as { sessionManager?: SessionManager }).sessionManager;
  if (!sessionManager) {
    throw new Error("Strapi session manager is unavailable — cannot establish an admin session");
  }

  const manager = sessionManager("admin");
  // UUIDv7, so the device id embeds when the session was established — useful
  // when reconciling a refresh-token row against the audit log.
  //
  // It carries 62 random bits rather than v4's 122, which is fine *here* because
  // deviceId is not a credential: Strapi's session manager keeps the bearer
  // secret in its own `sessionId` (the value signed into the JWT), and stores
  // deviceId only to group and invalidate a device's sessions. Do not reuse this
  // for anything that is presented as proof of identity.
  const deviceId = uuidv7();

  const { token: refreshToken } = await manager.generateRefreshToken(String(userId), deviceId, {
    type: "session",
    metadata: { userAgent: ctx.request.headers["user-agent"], origin: "sso" },
  });

  const base = cookieBase(strapi, ctx.request.secure);

  ctx.cookies.set(REFRESH_COOKIE_NAME, refreshToken, {
    ...base,
    httpOnly: true,
    overwrite: true,
  });

  const accessResult = await manager.generateAccessToken(refreshToken);
  if ("error" in accessResult) {
    throw new Error(`could not mint an admin access token: ${accessResult.error}`);
  }

  const accessCookieName =
    (strapi.config.get("admin.auth.cookie.name") as string) || DEFAULT_ACCESS_COOKIE_NAME;

  ctx.cookies.set(accessCookieName, accessResult.token, {
    ...base,
    // Readable by the admin SPA on purpose — see the module doc. The token is
    // short-lived (15 min, `config/admin.ts`) and the long-lived credential
    // stays httpOnly.
    httpOnly: false,
    overwrite: true,
  });

  return { accessToken: accessResult.token };
}
