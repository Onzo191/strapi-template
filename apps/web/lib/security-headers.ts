/**
 * Security response headers + Content-Security-Policy (P7 §9 "Security review
 * passed").
 *
 * Emitted from `next.config.ts` `headers()` so they are **static**: every
 * response carries them, including ISR-cached HTML served straight from the
 * cache and the `_next/static` assets. That is the whole reason this is a
 * config-level header set rather than middleware-generated.
 *
 * ## Why no CSP nonce
 *
 * The textbook strict CSP is `script-src 'nonce-<random>' 'strict-dynamic'`. It
 * is not reachable here, and the reason is architectural rather than lazy:
 *
 * - A nonce must be unique per response, so it must be generated per request in
 *   middleware and interpolated into the HTML. That makes every page
 *   **dynamically rendered** — Next cannot serve a nonce'd page from the ISR
 *   cache, because the cached copy would carry a stale nonce that the fresh
 *   response header no longer matches.
 * - ISR + `revalidateTag` is the load-bearing decision of this whole platform
 *   (§1, §5.1, A2/A4). Trading it away would mean regenerating thousands of
 *   article pages on every request, blowing both the Lighthouse budget (§6.4)
 *   and the CMS's request budget.
 * - Hashes don't substitute: Next's App Router inlines the RSC flight payload as
 *   `<script>self.__next_f.push(...)</script>`, whose content differs per page,
 *   so no fixed hash list can cover it.
 *
 * So `script-src` keeps `'unsafe-inline'`, and the XSS defence is layered
 * elsewhere instead of resting on CSP:
 *
 * 1. **No HTML sink takes CMS input.** Rich text renders through
 *    `blocks-react-renderer` (React elements, not `innerHTML`); the only two
 *    `dangerouslySetInnerHTML` calls emit `application/ld+json` with `<`
 *    escaped (`components/seo/json-ld.tsx`).
 * 2. **Every URL is scheme-checked** at render time via `safeHref` /
 *    `safeFrameSrc` (`@vng/shared`), so a `javascript:` href saved by an editor
 *    cannot become script.
 * 3. **The rest of the CSP is strict**, which removes the payoff even if script
 *    did run: `object-src 'none'` and `base-uri 'self'` kill the classic
 *    injection escalations, and a tight `connect-src`/`img-src`/`form-action`
 *    means an injected script has nowhere to exfiltrate to.
 *
 * ADR-007 records this trade-off and the revisit trigger (Next shipping
 * cache-compatible per-response nonces).
 */

/** Hosts the browser may load sub-resources from, derived from env at build time. */
export interface SecurityHeaderOptions {
  /** Strapi origin — media served by the local upload provider lives here. */
  strapiOrigin?: string;
  /** CloudFront/CDN origin in front of the S3 media bucket (§8.1). */
  cdnOrigin?: string;
  /**
   * Origins allowed in an `<iframe>` — the IR / Career / DMF / BU properties
   * that stay embedded rather than re-platformed (§0 A7). Comma-separated in
   * `EMBED_ALLOWED_ORIGINS`. Empty ⇒ `frame-src 'none'`, so an editor cannot
   * embed an arbitrary third-party document even if they paste one into the
   * `embed` block.
   */
  embedOrigins?: string[];
  /** `true` in `next dev`: React Refresh needs `eval` and websockets. */
  dev?: boolean;
  /** `false` disables HSTS (local http) — set from NODE_ENV by the caller. */
  hsts?: boolean;
  /** Send CSP as `Content-Security-Policy-Report-Only` instead of enforcing. */
  reportOnly?: boolean;
  /** Optional `report-uri`/`report-to` endpoint for CSP violation reports. */
  reportUri?: string;
}

/** Reduce a URL to `scheme://host[:port]`, or `null` if unusable. */
function toOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function uniq(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((v): v is string => Boolean(v)))];
}

/** Build the CSP header value. Exported for the QA spec to assert against. */
export function buildCsp(options: SecurityHeaderOptions = {}): string {
  const strapi = toOrigin(options.strapiOrigin);
  const cdn = toOrigin(options.cdnOrigin);
  const embeds = uniq((options.embedOrigins ?? []).map(toOrigin));
  const dev = options.dev ?? false;

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],

    // See the module doc: `'unsafe-inline'` is forced by App Router's inline
    // flight-data scripts on statically-generated pages. `'unsafe-eval'` is dev
    // only (React Refresh); it must never reach production.
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : [])],

    // Next injects inline <style> for critical CSS and the font-face block, and
    // Tailwind v4's runtime emits inline custom properties.
    "style-src": ["'self'", "'unsafe-inline'"],

    // `data:` covers the tiny inline SVGs in the design system; `blob:` covers
    // next/image's client-side object URLs.
    "img-src": uniq(["'self'", "data:", "blob:", strapi, cdn]),

    // next/font self-hosts, so no external font origin is needed.
    "font-src": ["'self'", "data:"],

    // RSC fetches Strapi *server-side*, so the browser never needs the CMS
    // origin — except in `next dev`, where HMR uses a websocket. Keeping this
    // tight is what stops an injected script POSTing scraped data out, and it
    // is also what confines the `contact-form` block's `endpoint` to our origin.
    "connect-src": uniq(["'self'", cdn, ...(dev ? ["ws:", "wss:", strapi] : [])]),

    // Empty allow-list ⇒ 'none': no embedding at all until an origin is
    // explicitly configured.
    "frame-src": embeds.length > 0 ? embeds : ["'none'"],

    // Flash/Java-era plugin sinks, and the classic `<base>` hijack.
    "object-src": ["'none'"],
    "base-uri": ["'self'"],

    // Form posts can only ever target us — no silent credential redirection.
    "form-action": ["'self'"],

    // We are never framed. `frame-ancestors` is the CSP replacement for
    // X-Frame-Options (which is also sent below for very old browsers).
    "frame-ancestors": ["'none'"],

    // Legacy worker/manifest sinks pinned to our own origin.
    "worker-src": ["'self'", "blob:"],
    "manifest-src": ["'self'"],
  };

  const parts = Object.entries(directives).map(([key, values]) => `${key} ${values.join(" ")}`);

  // Only meaningful over TLS; on http it makes `next dev` noisy for no gain.
  if (!dev) parts.push("upgrade-insecure-requests");
  if (options.reportUri) parts.push(`report-uri ${options.reportUri}`);

  return parts.join("; ");
}

export interface HeaderEntry {
  key: string;
  value: string;
}

/**
 * The full security header set. Ordering is irrelevant; grouping is for review.
 */
export function buildSecurityHeaders(options: SecurityHeaderOptions = {}): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    {
      key: options.reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
      value: buildCsp(options),
    },

    // Never MIME-sniff: a text/plain upload cannot be coerced into script.
    { key: "X-Content-Type-Options", value: "nosniff" },

    // Send the full URL same-origin, origin-only cross-origin, nothing on a
    // downgrade. Keeps draft-preview URLs (which carry a token) out of
    // third-party referer logs.
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },

    // Pre-CSP clickjacking defence, paired with `frame-ancestors 'none'`.
    { key: "X-Frame-Options", value: "DENY" },

    // Deny every powerful API by default — this is a content site.
    {
      key: "Permissions-Policy",
      value: [
        "accelerometer=()",
        "autoplay=()",
        "camera=()",
        "display-capture=()",
        "encrypted-media=()",
        "geolocation=()",
        "gyroscope=()",
        "magnetometer=()",
        "microphone=()",
        "midi=()",
        "payment=()",
        "usb=()",
        "xr-spatial-tracking=()",
      ].join(", "),
    },

    // Severs the window reference an opener could use to navigate us
    // (reverse tabnabbing), and puts us in our own browsing-context group.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },

    // Adobe crossdomain.xml legacy sink.
    { key: "X-Permitted-Cross-Domain-Policies", value: "none" },

    // Don't leak the visitor's browsing to DNS resolvers of linked hosts.
    { key: "X-DNS-Prefetch-Control", value: "off" },
  ];

  // HSTS only over TLS. `preload` is deliberately omitted: submitting
  // vng.com.vn to the preload list is an operations decision (it is effectively
  // irreversible and covers every subdomain), not a code one.
  if (options.hsts) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains",
    });
  }

  return headers;
}

/** Parse `EMBED_ALLOWED_ORIGINS` (comma-separated) into a list. */
export function parseOriginList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
