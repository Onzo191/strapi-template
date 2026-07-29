# syntax=docker/dockerfile:1.7
# =============================================================================
# apps/cms — Strapi 5 (Community) on ECS Fargate, RDS PostgreSQL 17 behind it,
# uploads going to S3 via the aws-s3 provider (§8.1).
#
# The SAME image serves two roles, which is what makes the migration gate in
# .github/workflows/deploy-app.yml trustworthy:
#   1. `pnpm start`   → the long-running Strapi server (default CMD)
#   2. `pnpm migrate` → the one-off ECS migration task, run BEFORE the new task
#                       set takes traffic (§8.2). Same code, same schemas.
#
# Build context is the REPOSITORY ROOT — Strapi (CommonJS) require()s
# @vng/shared's compiled dist/index.cjs, which lives in the workspace.
#
# Content note (§5.4): editors never trigger a build of this image. Content
# lives in Postgres/S3; publishing fires a signed webhook at the web tier.
# =============================================================================

FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm" \
    PATH="/pnpm:$PATH"
RUN corepack enable
WORKDIR /app

# -----------------------------------------------------------------------------
# deps — manifests only (see apps/web/Dockerfile for the rationale).
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
# build
# -----------------------------------------------------------------------------
FROM deps AS build
COPY . .
ENV NODE_ENV=production

# Workspace deps first: Strapi require()s @vng/shared's dist/index.cjs, so it
# must exist before `strapi build` / `strapi start` / `pnpm migrate`.
RUN pnpm --filter @vng/shared build
# `strapi build` emits dist/ (including the *.json content-type schemas Strapi 5
# loads from dist at runtime) plus the admin panel bundle.
RUN pnpm --filter @vng/cms build

# Drop devDependencies. CI=true is required, not cosmetic: pruning rewrites
# node_modules and pnpm refuses to do that without a TTY otherwise
# (ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    CI=true pnpm install --frozen-lockfile --prod --ignore-scripts

# -----------------------------------------------------------------------------
# runtime
# -----------------------------------------------------------------------------
FROM base AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=1337

RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=node:node /app /app
WORKDIR /app/apps/cms

# Strapi writes to .tmp/ and (when the S3 provider is not configured) to
# public/uploads. On Fargate the container filesystem is ephemeral and uploads
# go to S3 — these exist so a misconfigured env degrades to a warning, not a
# crash on boot.
RUN mkdir -p .tmp public/uploads && chown -R node:node .tmp public/uploads

USER node
EXPOSE 1337

# Strapi 5 exposes /_health (204 when up).
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=5 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/_health" || exit 1

CMD ["pnpm", "start"]
