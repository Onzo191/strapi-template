---
name: security
description: Security conventions and invariants for both apps — Content-API auth, the draft-read guard, CSP and security headers, rate limiting, admin session lifetimes, OIDC SSO/MFA, upload virus scanning, signed webhooks and secret handling. Use when touching auth, permissions, CSP/headers, rate limits, SSO, sessions, uploads, secrets, or when asked to review or harden security. Trigger words: XSS, CSRF, injection, CSP, header, auth, token, permission, rate limit, session, SSO, OIDC, MFA, secret, virus scan, HMAC, draft leak.
---

# Security (`apps/web` + `apps/cms`)

The seven invariants in [AGENTS.md](../../AGENTS.md#security-invariants) are enforced
in code. This skill is the *how* and, more importantly, the *why* — the reasoning that
makes it obvious when a change would break one. Decisions are recorded in
[docs/adr/006-security-hardening.md](../../docs/adr/006-security-hardening.md) and
[docs/adr/007-csp-without-nonces.md](../../docs/adr/007-csp-without-nonces.md).

## The threat model, in one line

**An editor is not a trust boundary.** Every string on the public site is authored by
someone holding a Contributor-or-above CMS account, so CMS content is untrusted input
in exactly the way form input is. That single premise explains most of what follows.

---

## Content API authentication

`apps/cms/src/bootstrap/permissions.ts`

The Content API is **token-authenticated by default**: the public role's read
permissions are actively *revoked* on boot (not merely "not granted" — an existing
database would keep them), and the web app authenticates with a read-only API token
provisioned from `STRAPI_READONLY_API_TOKEN`.

- `CMS_PUBLIC_READ=true` restores unauthenticated reads for local development, and is
  **ignored when `NODE_ENV=production`**.
- Adding a content type means adding its `find`/`findOne` to `PUBLIC_READ_ACTIONS`.
  **Read actions only** — that array is also what gets revoked, and a write action in
  it would be granted to anonymous callers whenever public read is on.

## The draft-read guard — read this before touching read paths

`apps/cms/src/middlewares/draft-guard.ts`

Strapi 5's core service defaults reads to published content:

```js
getFetchParams(params) { return { status: 'published', ...params } }
```

…but `status` is an allow-listed **client-supplied** query param, so it *overrides*
that default, and the Content API has no separate "read drafts" permission. Without a
guard, `GET /api/articles?status=draft` returns unpublished content to anyone on the
internet: embargoed press releases, financial results before disclosure, drafts with
the wrong numbers still in them.

The rule: **draft reads require a `full-access` API token.** That is what
`STRAPI_PREVIEW_TOKEN` is, and specifically what the web app's read-only token is not.
An unauthorised draft request is a **403**, not a silent downgrade to published — a
downgrade would hide both an attack and a misconfigured preview token behind pages
that merely look stale.

`publicationFilter` and `hasPublishedVersion` are blocked too: they are draft-vs-
published cohort selectors, so they answer "which documents exist but have never been
published?" even when the rows returned are published-only.

It is a **document-service** middleware, not a Koa one, and that is not a style
choice. Strapi composes authentication *inside* each route
(`authenticate → authorize → policies → route middlewares → action`), so a global Koa
middleware cannot see `ctx.state.auth`. A document-service middleware runs after
authentication and covers every content type automatically — including the next one
somebody adds. Calls with no request context (seed, the transition service, lifecycle
hooks) are trusted server code and pass through.

## Untrusted CMS strings → sinks

`packages/shared/src/security/url.ts`

| Sink | Use |
|---|---|
| `href` | `safeHref()` — or just use `SmartLink` / `ActionLink`, which call it |
| `<iframe src>` | `safeFrameSrc()` + `sandbox` + a CSP `frame-src` allow-list |
| `Location` (redirects) | `safeRedirect()` — also pins the status to one the redirect API accepts |
| preview `?url=` | `safePreviewPath()` — same-origin path only |
| JSON-LD | `components/seo/json-ld.tsx`, which escapes `<` |
| CSV export | `toCsv()` from `@vng/shared` |

Two of these are less obvious than they look:

- **`safeHref` rejects embedded control characters** rather than stripping them.
  Browsers ignore TAB/LF/CR *inside* a scheme, so `java\tscript:alert(1)` executes
  while defeating a naive `startsWith("javascript:")` check.
- **CSV export neutralises formula prefixes.** Spreadsheets evaluate a cell beginning
  `=`, `+`, `-` or `@`, and quoting does not help — they strip quotes first. The audit
  log contains editor-written rejection reasons, so an export opened by a compliance
  reviewer is a real exfiltration path.

There are exactly **two** `dangerouslySetInnerHTML` call sites, both emitting escaped
`application/ld+json`. Adding a third needs a very good reason. Rich text renders
through `blocks-react-renderer`, which produces React elements — not HTML.

## CSP and security headers

`apps/web/lib/security-headers.ts`, emitted from `next.config.ts` `headers()`.

Headers are **static**, which is what lets ISR-cached HTML carry them. `script-src`
keeps `'unsafe-inline'`, and that is a documented, deliberate trade-off rather than an
oversight:

- A nonce must be unique per response, so it must be generated in middleware, which
  makes every page **dynamically rendered** — Next cannot serve a nonce'd page from
  the ISR cache, because the cached HTML would carry a stale nonce.
- ISR + `revalidateTag` is the load-bearing decision of the platform (§1, §5.1, A2/A4).
- Hashes can't substitute: App Router inlines the RSC flight payload as
  `<script>self.__next_f.push(…)</script>`, whose content differs per page.

So the XSS defence rests on the sink discipline above, plus the rest of the CSP being
strict: `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`,
`form-action 'self'`, and tight `connect-src`/`img-src`/`frame-src` allow-lists so an
injected script has nowhere to exfiltrate to. `qa/e2e/security-headers.spec.ts`
asserts all of it on the wire.

`EMBED_ALLOWED_ORIGINS` gates `frame-src`. **Empty means `'none'`** — an editor cannot
embed an arbitrary third-party document until an origin is explicitly configured.

## Rate limiting — and why the two limiters differ

| | Web (`apps/web/lib/rate-limit.ts`) | CMS (`apps/cms/src/middlewares/rate-limit.ts`) |
|---|---|---|
| Scope | per instance, in memory | **cluster-wide**, Redis |
| Protects | `/api/revalidate`, `/api/preview` | admin login, writes, reads |
| On failure | n/a | **fails open**, logged at `error` |

The CMS one must be cluster-wide because it fronts login: per-instance counters would
give an attacker `limit × instances` attempts and let them round-robin below every
instance's threshold. The web one need not, because both endpoints it guards are
already authenticated by a shared secret — it is a second-order brake, and a
factor-of-two slack doesn't change that.

Two calls that look inconsistent and aren't:

- The **rate limiter fails open**: a Redis blip must not lock every editor out of the
  CMS mid-launch, and bcrypt + short sessions + IdP MFA remain in force.
- The **virus scanner fails closed**: an unavailable scanner blocks one upload, and
  serving malware from `vng.com.vn` is a takedown event.

Failing open blocks nobody; failing closed blocks one action. Size the decision by
what the failure costs.

`/admin/access-token` is deliberately **not** on the tight auth tier — every admin tab
calls it on each 15-minute refresh, so a 10-per-5-minute budget would lock working
editors out. `/api/sso/*` has its own looser tier so a NAT'd office isn't throttled.

## Admin sessions

`apps/cms/config/admin.ts` — 15-min access token, 30-min idle, 8-h absolute, and
"remember me" capped to the same 8 h. Strapi's defaults are 30 days. Don't lengthen
these without writing down why; a 30-day refresh token on a shared newsroom
workstation is a standing credential.

## SSO / MFA

`apps/cms/src/plugins/sso/`

OIDC Authorization Code + PKCE against VNG's IdP, with MFA asserted from the ID
token's `acr`/`amr` claims. Strapi's built-in `admin.auth.providers` is Enterprise-only,
so the flow is implemented here — but it reuses `strapi.sessionManager('admin')`, so
SSO sessions inherit the lifetimes above rather than being a parallel mechanism.

Non-obvious points:

- **`openid-client` is not usable** — v6+ is ESM-only and the Strapi server runs as
  CommonJS. `oidc.ts` uses Node's built-in `crypto` (which has first-class JWK
  support), so nothing cryptographic is hand-rolled, only the JWS framing.
- **`HS*` and `none` are excluded from the `alg` allow-list.** Accepting `HS256`
  alongside `RS256` is the key-confusion bypass.
- **Flow state lives in short-lived httpOnly cookies**, not server memory — with ≥2
  tasks the callback often lands on a different instance than the login. `SameSite=Lax`
  is required, not incidental: the callback is a cross-site top-level GET.
- **`strapi-super-admin` is never assignable from an IdP group.** Otherwise a group
  name administered by a different team on a different change-control process would
  mint full CMS control.
- **`OIDC_AUTO_PROVISION` is off by default**, and with it on you must set
  `OIDC_ALLOWED_EMAIL_DOMAINS` or anyone the IdP will issue a token for gets an
  account. The plugin logs an `error` if you do this.
- **`OIDC_ENFORCE=true`** redirects session-less admin page loads into the IdP, so the
  local password form is break-glass (`?sso=off`, which logs a `warn`).

## Upload virus scanning

`apps/cms/src/upload/`, `infra/lambda/virus-scan/`

Two modes, because they catch different things. **Inline** (`CLAMAV_HOST`) decorates
the upload provider so bytes are scanned before the object reaches S3 — this is what
prevents hosting malware. **Async** (S3 `ObjectCreated` → Lambda → signed callback)
catches objects that arrive by any other route: an operator's `aws s3 cp`, a restored
backup, a future direct-to-S3 upload.

The Lambda has `s3:GetObject` and deliberately **not** `s3:DeleteObject`: deletion
goes through the CMS so the library row and the object are removed together and the
deletion is audited.

## Signed webhooks

`packages/shared/src/security/signature.ts`

Both unauthenticated endpoints (`/api/revalidate`, `/api/upload-scan/callback`) verify
an HMAC over `<unix-seconds>.<body>` with a 5-minute replay window, constant-time
compared, behind a body-size cap. See
`.claude/skills/wire-revalidation-webhook` for why the timestamp must be *inside* the
signed payload.

## Secrets

Environment only; AWS Secrets Manager in deployed environments, injected as ECS task
secrets. `docker-compose.yml` holds obvious dev-only placeholders and nothing else.
`.dockerignore` excludes `.env*` (except `.env.example`) because `.gitignore` does not
apply to Docker build contexts — without it, a developer's local values would be baked
into a production image.

Adding a variable means: `.env.example` (documented, safe default) +
`docker-compose.yml` + the Terraform task definition.

## Reviewing / testing

```bash
pnpm --filter @vng/shared test        # URL, CSV and signature primitives
pnpm --filter @vng/qa e2e -- security-headers
pnpm --filter @vng/qa load:revalidate
```

Manual checks worth repeating after any auth change:

```bash
# Draft leak — must be 403
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:1337/api/articles?status=draft'
# Unauthenticated read — must be 401/403 when CMS_PUBLIC_READ=false
curl -s -o /dev/null -w '%{http_code}\n' 'localhost:1337/api/articles'
# Unsigned revalidation — must be 401
curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:3000/api/revalidate -d '{"model":"article"}'
# Open redirect via preview — must not emit a Location off-origin
curl -si 'localhost:3000/api/preview/exit?url=https://example.com' | grep -i location
```
