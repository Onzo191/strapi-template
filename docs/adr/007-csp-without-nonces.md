# ADR-007 — Static CSP without per-response nonces

- **Status:** Accepted
- **Date:** 2026-07 (P7)
- **Relates to:** [ADR-001](001-rendering-strategy.md), [ADR-006](006-security-hardening.md), plan §5.1, §6.4, §9

## Context

The launch security review requires a Content-Security-Policy. The textbook strict CSP
is

```
script-src 'nonce-<random>' 'strict-dynamic'
```

which neutralises injected `<script>` regardless of how it got into the page. Lighthouse's
`csp-xss` audit flags anything weaker.

This is genuinely unreachable here, and the reason is architectural rather than
laziness. It is written down because "why is `'unsafe-inline'` still in the CSP?" is a
question every future reviewer will ask, and the honest answer is a trade-off, not an
oversight.

## Why a nonce is incompatible with this architecture

1. **A nonce must be unique per response.** So it must be generated per request — in
   middleware — and interpolated into the HTML.
2. **That makes every page dynamically rendered.** Next cannot serve a nonce'd page
   from the ISR cache: the cached HTML would carry the nonce from whenever it was
   generated, while the response header carries a fresh one. They would not match, and
   every script on the page would be blocked. So Next opts the route out of caching.
3. **ISR is the load-bearing decision of the platform** ([ADR-001](001-rendering-strategy.md),
   assumptions A2/A4). Losing it means every request for every one of thousands of
   articles regenerates from Strapi — blowing the §6.4 Lighthouse budget (LCP < 2.5 s)
   and making the CMS the capacity limit for the public site.
4. **Hashes cannot substitute.** App Router inlines the RSC flight payload as
   `<script>self.__next_f.push(…)</script>`, and its content differs per page. No fixed
   hash list can cover it.

So the choice is: a strict `script-src` **or** ISR. Not both, with this framework
version.

## Options

### Nonce-based CSP, accept dynamic rendering

Strictest possible policy. Costs the entire caching architecture and the performance
budget. Rejected: it trades a measurable, always-on requirement (site performance under
launch traffic) for a defence against a vulnerability class we have separately closed
at every sink.

### `script-src 'self'` with no inline allowance

Would simply break the site — App Router's own bootstrap scripts are inline.

### Report-only CSP indefinitely

Reports without enforcing. Provides telemetry and zero protection; a permanent
"report-only" is a way of not making the decision.

### Static enforcing CSP with `'unsafe-inline'` on `script-src`, strict everywhere else (chosen)

Accept that `script-src` cannot be strict, and make everything else carry the weight.

## Decision

A **static, enforcing** CSP emitted from `next.config.ts` `headers()` — so ISR-cached
HTML carries it, and CloudFront can serve cached responses with the header intact.

`script-src` keeps `'unsafe-inline'` (`'unsafe-eval'` in dev only, for React Refresh;
`qa/e2e/security-headers.spec.ts` asserts it never reaches a built app). Everything
else is tight:

| Directive | Value | What it prevents |
|---|---|---|
| `object-src` | `'none'` | Flash/Java-era plugin execution sinks |
| `base-uri` | `'self'` | `<base href>` hijack redirecting every relative URL |
| `frame-ancestors` | `'none'` | Clickjacking (with `X-Frame-Options: DENY` for old browsers) |
| `form-action` | `'self'` | Credential-harvesting form retargeting |
| `connect-src` | `'self'` + CDN | Exfiltration by injected script — and it is what confines the `contact-form` block's editor-configurable endpoint to our origin |
| `img-src` | `'self'`, `data:`, `blob:`, Strapi, CDN | Pixel-based exfiltration to arbitrary hosts |
| `frame-src` | explicit allow-list, **empty ⇒ `'none'`** | An editor embedding an arbitrary third-party document |
| `default-src` | `'self'` | Everything not named above |

## What actually carries the XSS defence

Since CSP is not the primary control, the primary controls have to be real. All three
are enforced in code and covered by tests:

1. **No HTML sink takes CMS input.** Rich text renders through `blocks-react-renderer`,
   producing React elements — not HTML. There are exactly **two**
   `dangerouslySetInnerHTML` call sites, both emitting `application/ld+json` with `<`
   escaped to `<` (`components/seo/json-ld.tsx`). A third needs a very good
   reason.
2. **Every URL is scheme-checked at render time.** `safeHref` / `safeFrameSrc` from
   `@vng/shared`, applied in `SmartLink`, `ActionLink`, `Embed` and the redirect
   resolver, so an editor-authored `javascript:` URL cannot become script. Unit-tested,
   including the control-character obfuscation browsers honour.
3. **The rest of the CSP removes the payoff.** Even granting hypothetical script
   execution, `object-src 'none'` and `base-uri 'self'` kill the classic escalations,
   and the tight `connect-src`/`img-src`/`form-action` leave nowhere to send data.

Compensating monitoring: `CSP_REPORT_URI` can be pointed at a collector, and
`CSP_REPORT_ONLY=true` allows tuning against a real page inventory before enforcing a
change.

## Consequences

- **Lighthouse `csp-xss` will always warn.** It is configured as `"warn"` rather than
  `"error"` in `qa/lighthouserc.js`, with the reason inline. Making it an error would
  force either permanently ignoring a red gate or giving up ISR — and a gate everyone
  ignores is worse than no gate.
- An external security assessment will flag `'unsafe-inline'`. That is expected; this
  ADR is the answer, and the sink discipline above is the evidence.
- Adding a third-party script (analytics, chat) means widening `script-src`/`connect-src`
  deliberately, in code review, rather than by inheriting a permissive policy.

## Revisit if

- **Next ships cache-compatible per-response nonces** — e.g. a placeholder in cached
  HTML rewritten at the edge. This is the trigger to switch; the ISR objection
  disappears entirely.
- The site stops relying on ISR for content pages (it will not — [ADR-001](001-rendering-strategy.md)).
- Trusted Types becomes viable in React. It currently conflicts with
  `dangerouslySetInnerHTML`, but if React adopts a Trusted-Types-compatible path,
  `require-trusted-types-for 'script'` would let us re-tighten the script surface
  without a nonce.
