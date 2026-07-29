# syntax=docker/dockerfile:1.7
# =============================================================================
# apps/web — Next.js 16 on the **Node runtime**, NOT a static export (§8.1).
#
# This distinction is load-bearing for the whole architecture: ISR and the
# /api/revalidate webhook receiver both require a long-lived Node server.
# `next export` would delete both and reduce content freshness to "rebuild the
# site". So: `next build` + `next start`.
#
# The image runs as a SINGLE instance — the ISR cache is Next's own per-instance
# cache, so a second replica would serve content the publish webhook never
# invalidated. See docs/adr/008-single-instance.md before scaling this out.
#
# Build context is the REPOSITORY ROOT (see docker-compose.yml and
# .github/workflows/deploy-app.yml) because pnpm workspace deps
# (@vng/shared, @vng/design-system) are compiled into the Next build.
#
# Content note (§5.4): nothing an editor does in Strapi rebuilds this image.
# Publishing is webhook → revalidateTag against the *running* container.
# =============================================================================

FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH" \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# -----------------------------------------------------------------------------
# deps — manifests only, so the (slow) dependency resolve is cached and only
# re-runs when the lockfile or a package.json actually changes. `--frozen-
# lockfile` needs EVERY workspace member's manifest present or it refuses.
# -----------------------------------------------------------------------------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json .npmrc .nvmrc ./
COPY apps/web/package.json                 apps/web/
COPY apps/cms/package.json                 apps/cms/
COPY packages/shared/package.json          packages/shared/
COPY packages/design-system/package.json   packages/design-system/
COPY packages/config-biome/package.json    packages/config-biome/
COPY packages/config-tsconfig/package.json packages/config-tsconfig/
COPY qa/package.json                       qa/
# NOTE: `docs/package.json` is deliberately absent. `docs/` is a pnpm workspace (the
# Docusaurus handbook) but is excluded by `.dockerignore`, so its manifest never reaches
# the build context and its ~400 MB of dev dependencies never enter this image.
# `--frozen-lockfile` tolerates the missing importer; if a future pnpm makes that an
# error, filter it out (`--filter '!@vng/docs'`) rather than copying the manifest in.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile

# -----------------------------------------------------------------------------
# build — full source, then `next build`.
# -----------------------------------------------------------------------------
FROM deps AS build
COPY . .

# Public env must be baked in at build time — Next inlines NEXT_PUBLIC_* into
# the bundle, and NEXT_PUBLIC_SITE_URL is the canonical origin behind every
# canonical link, hreflang alternate, sitemap entry and JSON-LD `url`. Getting
# it wrong is an SEO bug you only notice in production, so the deploy workflow
# asserts it is set before it ever calls docker build.
ARG NEXT_PUBLIC_SITE_URL
ARG CDN_URL
ARG STRAPI_URL
ENV NODE_ENV=production

# `${VAR:-default}` rather than plain ENV: docker turns an omitted build-arg
# into an EMPTY STRING, not an unset variable, and `new URL("")` throws. The
# defaults keep `docker compose build` (which passes no build args) working.
RUN NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-http://localhost:3000}" \
    CDN_URL="${CDN_URL:-}" \
    STRAPI_URL="${STRAPI_URL:-http://localhost:1337}" \
    pnpm --filter @vng/web build

# Drop devDependencies from the workspace in place. Everything `next start`
# needs at runtime (next, react, next-intl) is a prod dependency; the
# workspace packages were already compiled into .next.
#
# CI=true is required, not cosmetic: pruning rewrites node_modules, and pnpm
# refuses to do that non-interactively without it (ERR_PNPM_ABORTED_REMOVE_
# MODULES_DIR_NO_TTY).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    CI=true pnpm install --frozen-lockfile --prod --ignore-scripts

# -----------------------------------------------------------------------------
# runtime
# -----------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# curl is only here for the container HEALTHCHECK below; ECS also probes the
# same path through the ALB target group.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app /app
WORKDIR /app/apps/web

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/api/health" || exit 1

# `pnpm start` → `next start`. ECS sets `initProcessEnabled` so PID 1 reaps and
# forwards SIGTERM, letting Next drain in-flight requests during a blue/green
# cutover instead of being SIGKILLed.
CMD ["pnpm", "start"]
