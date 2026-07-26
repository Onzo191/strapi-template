# Build context is the repository root (see docker-compose.yml).
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# Build workspace deps first: Strapi (CommonJS) require()s @vng/shared's
# compiled dist/index.cjs, so it must exist before `strapi build`/`start`.
RUN pnpm --filter @vng/shared build
RUN pnpm --filter @vng/cms build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=build /app /app
WORKDIR /app/apps/cms
EXPOSE 1337
CMD ["pnpm", "start"]
