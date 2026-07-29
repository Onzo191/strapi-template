# apps/cms — CMS agent notes

Strapi 5 **Community** edition on Postgres 17. Owns the content model, the
page-builder components, the editorial workflow, and the publish webhook that keeps
the web app fresh. Read [../../AGENTS.md](../../AGENTS.md) first for the
content-vs-code rule and the security invariants.

## Layout

```
config/
├─ admin.ts          admin secrets, SESSION LIFETIMES, cookie flags, draft preview
├─ api.ts            Content-API limits (maxLimit, strictParams)
├─ database.ts       Postgres
├─ middlewares.ts    security/CSP, CORS, rate-limit, body caps, session
├─ plugins.ts        i18n, S3 upload provider, local plugins (editorial, sso)
└─ server.ts         host/port/app keys
src/
├─ api/<type>/       content types: schema.json + controller + route + service
│  └─ upload-scan/   HMAC-signed virus-scan verdict callback (no content type)
├─ components/       page-builder components — blocks/, elements/, shared/, navigation/
├─ bootstrap/        locales, Content-API access model, demo seed
├─ middlewares/      draft-guard (document-service), rate-limit (Koa, in-process)
├─ upload/           clamav client + inline scan provider decoration
├─ webhooks/         revalidation.ts — document-service middleware → signed POST
├─ plugins/editorial/  workflow + immutable audit log (§4.5)
├─ plugins/sso/        OIDC admin SSO + MFA assurance (Req §8)
└─ index.ts          register() + bootstrap() wiring
```

## Content model

| Type | i18n | D&P | Notes |
|---|---|---|---|
| `article` | ✓ | ✓ | Rich body + SEO + category/tags/author |
| `landing-page` | ✓ | ✓ | Fully block-composed (dynamic zone) |
| `page` | ✓ | ✓ | Static shell — about/legal |
| `category`, `tag` | ✓ | – | Taxonomy |
| `author` | – | – | Byline + JSON-LD `author` |
| `redirect` | – | – | 301 map (from→to), Req §6 |
| `navigation` | ✓ | ✓ | Multi-level header/footer menu |
| `global` (single) | ✓ | – | Site name, default SEO, org schema |

## Conventions

**Content types.** Full recipe: `.claude/skills/add-content-type`. The parts that
are easy to miss:

- `schema.json` lives at `src/api/<name>/content-types/<name>/schema.json`. Strapi
  loads schemas **from `dist`**, so `apps/cms/tsconfig.json` must keep
  `src/**/*.json` in `include` — drop it and content types silently vanish.
- Add the type to `POPULATE` in `packages/shared/src/population.ts` and override
  `find`/`findOne` in the controller with `applyListPopulate`/`applyDetailPopulate`.
  List endpoints return **cards only**; detail endpoints deep-populate. This is what
  keeps list payloads inside the Lighthouse budget.
- Add it to `WATCHED_MODELS` in `src/webhooks/revalidation.ts` and to `tagsForEntry`
  in `@vng/shared`, or publishing it will never invalidate the FE cache.
- If it should be publicly readable, add its `find`/`findOne` to
  `PUBLIC_READ_ACTIONS` in `src/bootstrap/permissions.ts`.

**Components (page-builder blocks).** `src/components/blocks/<name>.json`, then a
matching React component and registry entry on the web side —
`.claude/skills/add-page-builder-block` covers both halves. A block that exists in
Strapi but not in the FE registry renders as nothing, with no error.

**Identifiers are UUIDv7.** `src/bootstrap/document-ids.ts` swaps Strapi's cuid2
`documentId` generator for `uuidv7()` from `@vng/shared`, so every `documentId` is
time-ordered and self-dating (`uuidV7Timestamp` recovers the creation time). It
works by replacing the `default` function on the loaded DB metadata — there is no
config hook — and throws on boot if Strapi's shape changes rather than silently
reverting to cuid2. Old cuid2 ids are **not** migrated: `document_id` is an opaque
`varchar` and both formats coexist fine. The numeric `id` primary key stays an
`increments` — Strapi hardwires that, and every join-table FK is an integer.

**All time values are stored at UTC+0, in `timestamptz` columns.** Three pieces,
and all three are load-bearing:

| Where | What |
|---|---|
| `config/database.ts` | `process.env.TZ = "UTC"` + `SET TIME ZONE 'UTC'` on every pooled connection |
| `src/bootstrap/timestamps.ts` | converts Strapi's `timestamp WITHOUT time zone` columns to `timestamptz` on every boot |
| `docker-compose.yml`, `Dockerfile` | `TZ=UTC` so the process never *starts* in another zone |

Strapi hard-codes `useTz: false`, so left alone every column is naive and stores
the *writing process's* wall clock — which differs between `docker compose up`
(UTC) and `pnpm --filter @vng/cms dev` on a laptop (+07). The conversion runs on
`content-types.afterSync`, so a content type added today is converted on the same
boot that creates its columns, and it re-asserts the invariant every boot instead
of trusting it. Read the header comment in `timestamps.ts` before touching any of
this — in particular *why* Strapi's schema sync does not revert the columns.

`date` and `time` attributes are exempt by nature: they carry no offset. Don't
reach for them when you mean an instant — use `datetime`.

**Custom code vs plugin** (§4.6):

| Situation | Do |
|---|---|
| Tied to one content type, no admin UI, no reuse | inline controller/service/route or lifecycle |
| Pure configuration (S3, locales, RBAC, webhooks) | `config/` |
| Cross-type, needs admin UI / settings / own tables | a plugin under `src/plugins/` |

## Middleware ordering — read this before adding a guard

Strapi composes authentication **inside each route**:

```
route = authenticate → authorize → policies → route middlewares → action
```

Koa middlewares registered in `config/middlewares.ts` run *before the router*, so
they **cannot see `ctx.state.auth`**. A guard that needs to know who is calling has
three options, in order of preference:

1. **Document-service middleware** (`strapi.documents.use`) — runs after auth, sees
   resolved params, covers every content type automatically including ones added
   later. Recover the HTTP context with `strapi.requestContext.get()`.
   `src/middlewares/draft-guard.ts` is the worked example.
2. **Route middleware** (`config.middlewares` on the route) — sees auth, but must be
   wired onto every route and will silently miss the next one somebody adds.
3. **Koa middleware** — only for things that don't need identity: rate limiting,
   headers, body caps.

## Security notes specific to this app

- **Draft content is not public.** Strapi's core service defaults reads to
  `status: 'published'`, but `status` is a client-supplied query param that
  *overrides* that default, and the Content API has no separate draft permission. So
  `?status=draft` would otherwise expose embargoed content to anyone.
  `src/middlewares/draft-guard.ts` requires a **full-access** API token for any
  non-published read. Don't route around it — that is what `STRAPI_PREVIEW_TOKEN`
  is for.
- **The Content API is token-authenticated.** `src/bootstrap/permissions.ts`
  provisions a read-only token from `STRAPI_READONLY_API_TOKEN` and actively
  **revokes** public read permissions. `CMS_PUBLIC_READ=true` is a local-development
  escape hatch and is ignored in production.
- **Admin sessions are short** (`config/admin.ts`): 15-min access token, 30-min
  idle, 8-h absolute, and "remember me" is capped to the same 8 h. Strapi's defaults
  are 30 days; don't restore them.
- **Rate limiting is in-process** (`src/middlewares/rate-limit.ts`) — fixed-window
  counters in a `Map`, four tiers (`auth`/`sso`/`write`/`read`). Sound because the
  CMS runs as **one instance**, so per-instance is cluster-wide
  ([ADR-008](../../docs/adr/008-single-instance.md)). It has no external dependency
  and so is always in force; the earlier Redis version silently did nothing whenever
  `REDIS_URL` was unset. If the CMS is ever scaled out, an attacker gets
  `limit × instances` login attempts and can round-robin below every threshold —
  set `RATE_LIMIT_INSTANCES` to divide the budgets, and read the ADR.
- **Uploads are scanned.** `src/upload/virus-scan.ts` decorates the upload provider
  so bytes are scanned before they reach S3 (`CLAMAV_HOST`), plus an async S3 →
  Lambda → signed-callback path for objects that arrive by any other route.
- **Admin SSO** (`src/plugins/sso/`) is OIDC Authorization Code + PKCE with MFA
  assurance from `acr`/`amr`. It reuses `strapi.sessionManager('admin')`, so SSO
  sessions inherit the lifetimes above rather than being a parallel mechanism.
  `strapi-super-admin` is never assignable from an IdP group.
- **The audit log is append-only and role-gated.** Reading it needs `auditRead`,
  exporting needs `auditExport` (`plugins/editorial/.../constants/rbac.ts`).
  CSV export goes through `toCsv` from `@vng/shared`, which neutralises spreadsheet
  formula prefixes — editor-authored rejection reasons end up in that file.

## Local development

**Configuration comes from `apps/cms/.env`** (then `.env.local`), which
`docker-compose.yml` loads with `env_file`. Compose contributes only what cannot be
right outside its network — `DATABASE_HOST=postgres`, container-internal ports,
`WEB_REVALIDATE_URL=http://web:3000/…` — plus `TZ=UTC`, `ADMIN_COOKIE_SECURE=false`
and `TRUSTED_PROXY_HOPS`. No secret is in the compose file. Two values **must** match
`apps/web/.env.local` or the stack looks healthy and misbehaves:
`STRAPI_READONLY_API_TOKEN` = web's `STRAPI_API_TOKEN` (else every page renders
empty), and `REVALIDATE_SECRET` (else published content never appears).

Because `environment:` wins over `env_file`, adding a key to compose silently
overrides everyone's `.env`. Put new configuration in `.env.example` instead, and
keep compose for topology.

**The first admin account** is provisioned by `src/bootstrap/admin-user.ts` from
`BOOTSTRAP_ADMIN_EMAIL` / `BOOTSTRAP_ADMIN_PASSWORD`, so a reset database comes up
usable instead of parked on the "create first administrator" form. It is
create-only: an existing account with that e-mail is never touched, so the variable
cannot be used to reset a live password.

To reset content, remove **only** the Postgres volume — `docker compose down -v`
would also delete `cmsuploads`:

```bash
docker compose down && docker volume rm vng-platform_pgdata && docker compose up -d
```

```bash
docker compose up                              # postgres + cms + web
CLAMAV_HOST=clamav docker compose --profile scan up   # + inline virus scanning

pnpm --filter @vng/cms dev                     # strapi develop against the compose DB
pnpm --filter @vng/cms generate:types          # regenerate types after a schema change
pnpm --filter @vng/cms import:redirects <csv>  # bulk-load the legacy 301 map
```

Admin at http://localhost:1337/admin. `SEED=true` loads demo content on the first
boot of an empty database and no-ops afterwards.

After changing `packages/shared`, run `pnpm --filter @vng/shared build` — Strapi
consumes the compiled `dist/index.cjs`, not the TypeScript source, so it will
otherwise keep using a stale copy.
