/**
 * Middleware stack (P7 §9 hardening).
 *
 * Order is load-bearing — Koa runs these outside-in, so anything that rejects a
 * request must sit *before* the machinery it protects:
 *
 *   logger → errors → security(headers/CSP) → cors → rate-limit → poweredBy
 *   → query → body(size caps) → session → favicon → public
 *
 * `rate-limit` sits above `body` so a flood is rejected before we parse (or
 * buffer) a payload.
 *
 * The draft-read guard is deliberately *not* in this list. Koa middlewares run
 * before the router, and Strapi composes authentication *inside* each route
 * (`authenticate → authorize → policies → route middlewares → action`), so
 * nothing at this level can see `ctx.state.auth`. It is registered as a
 * document-service middleware instead — see `src/middlewares/draft-guard.ts`.
 */

/** Comma-separated env list → trimmed array. */
const list = (raw: string | undefined): string[] =>
  (raw ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/** Reduce a URL to its origin, dropping anything unparseable. */
const origins = (values: string[]): string[] => {
  const out: string[] = [];
  for (const value of values) {
    try {
      out.push(new URL(value).origin);
    } catch {
      // Ignore malformed entries rather than crashing boot on a typo'd env var.
    }
  }
  return out;
};

export default ({ env }) => {
  const isProd = env("NODE_ENV") === "production";

  // The public web origin (for CORS + CSP connect-src) and the CDN in front of
  // S3 media, which the admin's media library loads previews from.
  const webOrigins = origins([
    ...list(env("WEB_ALLOWED_ORIGINS")),
    ...(env("WEB_PREVIEW_URL") ? [env("WEB_PREVIEW_URL")] : []),
  ]);
  const cdnOrigins = origins(env("CDN_URL") ? [env("CDN_URL")] : []);
  // The IdP the admin SSO flow redirects to (§10.2 Q1 — OIDC).
  const idpOrigins = origins(env("OIDC_ISSUER") ? [env("OIDC_ISSUER")] : []);

  return [
    "strapi::logger",
    "strapi::errors",

    {
      name: "strapi::security",
      config: {
        contentSecurityPolicy: {
          useDefaults: true,
          directives: {
            // Strapi's default is `connect-src 'self' https:` — i.e. the admin
            // may talk to *any* https host. Narrowed to what the admin actually
            // needs so an injected script in the admin panel (the highest-value
            // XSS target in this system: it holds a session that can publish and
            // read every draft) has nowhere to exfiltrate to.
            "connect-src": ["'self'", ...cdnOrigins, ...idpOrigins],
            "img-src": ["'self'", "data:", "blob:", ...cdnOrigins],
            "media-src": ["'self'", "data:", "blob:", ...cdnOrigins],
            // The admin bundle is served from this origin only.
            "script-src": ["'self'", "'unsafe-inline'"],
            "style-src": ["'self'", "'unsafe-inline'"],
            "frame-ancestors": ["'none'"],
            "base-uri": ["'self'"],
            "object-src": ["'none'"],
            // The SSO flow POSTs/redirects to the IdP's authorize endpoint.
            "form-action": ["'self'", ...idpOrigins],
            // Only meaningful over TLS; null on http keeps local dev usable.
            upgradeInsecureRequests: isProd ? [] : null,
          },
        },
        // The admin must never be framed — Strapi's default is `sameorigin`.
        frameguard: { action: "deny" },
        hsts: isProd ? { maxAge: 63_072_000, includeSubDomains: true } : false,
        crossOriginOpenerPolicy: isProd ? { policy: "same-origin" } : false,
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      },
    },

    {
      name: "strapi::cors",
      config: {
        // Strapi's default is `origin: ['*']`. With an explicit allow-list, a
        // malicious page cannot read Content-API responses from a visitor's
        // browser — which matters because a logged-in editor browsing the web
        // would otherwise have their credentials usable cross-origin.
        // Server-to-server RSC fetches are unaffected: CORS is a browser control.
        origin: webOrigins.length > 0 ? webOrigins : ["http://localhost:3000"],
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"],
        headers: ["Content-Type", "Authorization", "Origin", "Accept"],
        keepHeaderOnError: true,
        credentials: false,
      },
    },

    // Cluster-wide request admission (see src/middlewares/rate-limit.ts). Before
    // `body` so a flood never reaches the parser.
    "global::rate-limit",

    "strapi::poweredBy",
    "strapi::query",

    {
      name: "strapi::body",
      config: {
        // Strapi's defaults are generous (200mb form limit). Media uploads need
        // room, but JSON/text bodies do not — an unbounded JSON body is a
        // trivial memory-exhaustion vector against every content endpoint.
        jsonLimit: env("BODY_JSON_LIMIT", "1mb"),
        formLimit: env("BODY_FORM_LIMIT", "1mb"),
        textLimit: env("BODY_TEXT_LIMIT", "1mb"),
        formidable: {
          // Media library ceiling. Also bounds what the virus scanner has to
          // process per upload (see src/upload/virus-scan.ts).
          maxFileSize: env.int("UPLOAD_MAX_FILE_SIZE_BYTES", 50 * 1024 * 1024),
        },
      },
    },

    {
      name: "strapi::session",
      config: {
        // The session cookie backs admin auth flows; it must never be readable
        // by script, never cross-site, and never sent over plain http in prod.
        // (`secure: false` locally, or the admin cannot log in over http.)
        httpOnly: true,
        secure: isProd,
        sameSite: "lax",
        maxAge: env.int("SESSION_COOKIE_MAX_AGE_MS", 8 * 60 * 60 * 1000),
      },
    },

    "strapi::favicon",
    "strapi::public",
  ];
};
