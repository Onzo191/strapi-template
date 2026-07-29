/**
 * SSO routes.
 *
 * `type: "content-api"` mounts them under the REST prefix (`/api/sso/...`) rather
 * than the admin API. That is what makes them reachable *before* the visitor has
 * any admin session — which is the entire point of a login endpoint — and it
 * keeps them out of the admin API's permission engine, where an unauthenticated
 * route would be an odd exception.
 *
 * `auth: false` on each: the flow's own state/nonce/PKCE checks and the ID-token
 * verification are the authentication. `/sso/callback` is the only one that
 * establishes a session, and it will not do so without a `state` matching the
 * httpOnly cookie set by `/sso/login`.
 */
export default {
  "content-api": {
    type: "content-api",
    routes: [
      {
        method: "GET",
        path: "/login",
        handler: "sso.login",
        config: { auth: false },
      },
      {
        method: "GET",
        path: "/callback",
        handler: "sso.callback",
        config: { auth: false },
      },
      {
        method: "GET",
        path: "/status",
        handler: "sso.status",
        config: { auth: false },
      },
    ],
  },
};
