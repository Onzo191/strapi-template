/**
 * URL-safety helpers (P7 hardening).
 *
 * Every href / iframe src / redirect target on this site comes from the CMS,
 * which means it comes from *an authenticated editor* — the exact threat model
 * the editorial RBAC in §4.5 acknowledges (Contributor is the lowest-trust role
 * that can still write content). A `javascript:` URL saved into a `link`
 * component would otherwise become stored XSS the moment a visitor clicks it,
 * so the render layer — not the schema — is the enforcement point: schema
 * validation can be bypassed by a direct DB write, a seed script or the
 * redirect CSV importer, whereas nothing reaches the DOM without passing here.
 *
 * Framework-free (no `next`, no DOM) so both apps can use it.
 */

/** Schemes we will ever emit into an `href`. Anything else is dropped. */
const SAFE_LINK_SCHEMES = new Set(["http:", "https:", "mailto:", "tel:"]);

/** Schemes allowed in an `<iframe src>` — network only, no inline documents. */
const SAFE_FRAME_SCHEMES = new Set(["https:", "http:"]);

/**
 * `NextResponse.redirect` (like the WHATWG `Response.redirect`) only accepts
 * these. A `redirect` row with `statusCode: 350` — inside the schema's 300–399
 * range — would otherwise throw a `RangeError` inside middleware and 500 every
 * request for that path.
 */
const VALID_REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/**
 * Browsers ignore TAB/LF/CR *inside* a scheme, so `java\tscript:alert(1)` still
 * executes while failing a naive `startsWith("javascript:")` check. Rather than
 * normalise such a string into something safe, reject it: no legitimate URL an
 * editor pastes contains a raw C0 control character, so their presence is
 * itself the signal.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: detecting C0 controls is the point
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

/**
 * Trim surrounding whitespace (which browsers also ignore) and reject anything
 * carrying embedded control characters or an empty result.
 */
function canonicalize(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || CONTROL_CHARS.test(trimmed)) return null;
  return trimmed;
}

/**
 * A relative URL that is unambiguously same-origin: starts with a single `/`,
 * and not `//host` (protocol-relative → another origin) or `/\host` (which
 * several parsers normalise to `//host`).
 */
function isSameOriginPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\");
}

/**
 * Return `href` if it is safe to render, else `null`.
 *
 * Accepts same-origin paths (`/tin-tuc/x`), fragments (`#section`), queries
 * (`?page=2`) and absolute URLs on an allow-listed scheme. Rejects
 * `javascript:`, `data:`, `vbscript:`, `blob:`, `file:` and anything
 * unparseable.
 */
export function safeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const value = canonicalize(href);
  if (!value) return null;

  // Relative forms carry no scheme, so they can't be a scheme attack.
  if (value.startsWith("#") || value.startsWith("?")) return value;
  if (isSameOriginPath(value)) return value;

  // Anything else must parse as an absolute URL on an allow-listed scheme. A
  // bare `foo/bar` (no scheme, no leading slash) is rejected rather than
  // guessed at — the CMS should store `/foo/bar`.
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  return SAFE_LINK_SCHEMES.has(parsed.protocol) ? value : null;
}

/**
 * Return `src` if it is safe to put in an `<iframe>`, else `null`. Stricter
 * than {@link safeHref}: no relative paths (an embed block always points at an
 * external property per §0 A7), no `mailto:`/`tel:`, and — unless
 * `allowInsecure` — no plain `http:`, which would trip mixed-content blocking
 * on an https site anyway.
 */
export function safeFrameSrc(
  src: string | null | undefined,
  { allowInsecure = false }: { allowInsecure?: boolean } = {},
): string | null {
  if (!src) return null;
  const value = canonicalize(src);
  if (!value) return null;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (!SAFE_FRAME_SCHEMES.has(parsed.protocol)) return null;
  if (parsed.protocol === "http:" && !allowInsecure) return null;
  return parsed.toString();
}

export interface SafeRedirect {
  to: string;
  statusCode: number;
}

/**
 * Validate a CMS-authored redirect before it is emitted as a `Location`.
 *
 * - `to` must be a same-origin path or an allow-listed absolute URL. External
 *   targets stay permitted (the legacy map does point at BU/IR properties per
 *   §0 A7) but `javascript:`/`data:` do not, so a redirect row can never be a
 *   script sink.
 * - `statusCode` must be one the redirect API actually accepts; anything else
 *   falls back to `fallbackStatus` instead of throwing inside middleware.
 */
export function safeRedirect(
  to: string | null | undefined,
  statusCode: number | null | undefined,
  fallbackStatus = 301,
): SafeRedirect | null {
  const target = safeHref(to);
  if (!target) return null;
  // `mailto:`/`tel:` are fine in an anchor but nonsensical as a 301 target.
  if (/^(mailto|tel):/i.test(target)) return null;

  const status =
    typeof statusCode === "number" && VALID_REDIRECT_STATUS.has(statusCode)
      ? statusCode
      : fallbackStatus;
  return { to: target, statusCode: status };
}

/**
 * Validate the `url` parameter of the draft-preview entry route: it must be a
 * same-origin path, never an absolute URL. Returning the path (not a `URL`)
 * stops the caller resolving it against anything but its own origin.
 */
export function safePreviewPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = canonicalize(value);
  if (!candidate || !isSameOriginPath(candidate)) return null;
  // Belt and braces: reject anything that would still parse as absolute.
  try {
    new URL(candidate);
    return null;
  } catch {
    return candidate;
  }
}
