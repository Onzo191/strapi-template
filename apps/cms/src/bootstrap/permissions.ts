/**
 * Content-API read access (§4.4/§6 — the FE reads these over the REST API).
 *
 * ## What changed in P7 (§9 "add API auth")
 *
 * Until now the `public` role was granted read on every content type, so the
 * whole Content API answered unauthenticated requests. That is convenient and it
 * is what the FE relied on, but it means:
 *
 *  - no way to distinguish our own renderer from a scraper, so rate limiting and
 *    abuse response have nothing to key on but IP;
 *  - no way to revoke access short of editing permissions in the admin;
 *  - every future content type is public the moment somebody adds it here.
 *
 * The default is now **token-authenticated**: `CMS_PUBLIC_READ` defaults to
 * `false`, the public role's read permissions are actively **revoked** (not
 * merely "not granted" — a previously-bootstrapped database keeps them
 * otherwise), and the FE authenticates with a read-only API token
 * (`STRAPI_API_TOKEN`).
 *
 * `CMS_PUBLIC_READ=true` restores the old behaviour for the local
 * docker-compose stack, where wiring a token by hand would make `docker compose
 * up` a multi-step ritual. It refuses to take effect in production — see below.
 *
 * The token itself is provisioned from `STRAPI_READONLY_API_TOKEN` so the whole
 * stack still comes up from `docker compose up` with authentication *on*, which
 * is what makes the authenticated path the one that actually gets exercised in
 * development rather than only in prod.
 */
import type { Core } from "@strapi/strapi";

const PUBLIC_READ_ACTIONS = [
  "api::article.article.find",
  "api::article.article.findOne",
  "api::landing-page.landing-page.find",
  "api::landing-page.landing-page.findOne",
  "api::page.page.find",
  "api::page.page.findOne",
  "api::category.category.find",
  "api::category.category.findOne",
  "api::tag.tag.find",
  "api::tag.tag.findOne",
  "api::author.author.find",
  "api::author.author.findOne",
  "api::navigation.navigation.find",
  "api::navigation.navigation.findOne",
  "api::global.global.find",
  // Redirects (§6.3): the web middleware fetches the full table to resolve 301s.
  "api::redirect.redirect.find",
];

/** Name of the API token the web app authenticates with. */
const READONLY_TOKEN_NAME = "web-readonly";

/** Name of the preview API token the web app authenticates with. */
const PREVIEW_TOKEN_NAME = "web-preview";

function publicReadEnabled(strapi: Core.Strapi): boolean {
  const requested = process.env.CMS_PUBLIC_READ === "true";
  if (!requested) return false;

  // A misplaced `CMS_PUBLIC_READ=true` in a prod task definition would silently
  // undo the whole change, so production ignores it and says so loudly.
  if (
    process.env.NODE_ENV === "production" &&
    process.env.CMS_ALLOW_PUBLIC_READ_IN_PROD !== "true"
  ) {
    strapi.log.error(
      "[bootstrap] CMS_PUBLIC_READ=true was ignored because NODE_ENV=production. " +
        "The Content API stays token-authenticated. Set CMS_ALLOW_PUBLIC_READ_IN_PROD=true " +
        "to override — but prefer issuing a read-only API token instead.",
    );
    return false;
  }
  return true;
}

async function grantPublicRead(strapi: Core.Strapi): Promise<void> {
  const publicRole = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "public" } });
  if (!publicRole) return;

  const existing: Array<{ action: string }> = await strapi.db
    .query("plugin::users-permissions.permission")
    .findMany({ where: { role: publicRole.id }, select: ["action"] });
  const existingActions = new Set(existing.map((permission) => permission.action));

  const missing = PUBLIC_READ_ACTIONS.filter((action) => !existingActions.has(action));
  if (missing.length === 0) return;

  for (const action of missing) {
    await strapi.db
      .query("plugin::users-permissions.permission")
      .create({ data: { action, role: publicRole.id } });
  }
  strapi.log.warn(
    `[bootstrap] granted PUBLIC (unauthenticated) read for ${missing.length} action(s) — ` +
      "development convenience only",
  );
}

/**
 * Remove the read permissions an earlier boot (or an admin) granted to the
 * public role. Idempotent, and scoped to `PUBLIC_READ_ACTIONS` so an unrelated
 * permission somebody added on purpose survives.
 */
async function revokePublicRead(strapi: Core.Strapi): Promise<void> {
  const publicRole = await strapi.db
    .query("plugin::users-permissions.role")
    .findOne({ where: { type: "public" } });
  if (!publicRole) return;

  const stale: Array<{ id: number; action: string }> = await strapi.db
    .query("plugin::users-permissions.permission")
    .findMany({
      where: { role: publicRole.id, action: { $in: PUBLIC_READ_ACTIONS } },
      select: ["id", "action"],
    });
  if (stale.length === 0) return;

  for (const permission of stale) {
    await strapi.db.query("plugin::users-permissions.permission").delete({
      where: { id: permission.id },
    });
  }
  strapi.log.info(
    `[bootstrap] revoked ${stale.length} public read permission(s) — ` +
      "the Content API now requires an API token",
  );
}

/**
 * Provision (or re-key) the read-only Content-API token the web app uses.
 *
 * Strapi stores only a salted hash of a token, and its `create` service
 * *generates* the access key rather than accepting one — so a deterministic,
 * env-supplied token has to be written through `db.query` with the service's own
 * `hash()`. That is a supported service method (`admin::api-token.hash`), not a
 * reimplementation of the hashing, so a future change to Strapi's algorithm
 * follows automatically.
 *
 * Type `read-only` matters: it is what the draft guard keys on to ensure this
 * token cannot read unpublished content even though it can read everything else.
 */
async function ensureReadOnlyApiToken(strapi: Core.Strapi): Promise<void> {
  const accessKey = process.env.STRAPI_READONLY_API_TOKEN;
  if (!accessKey) return;

  if (accessKey.length < 32) {
    strapi.log.error(
      "[bootstrap] STRAPI_READONLY_API_TOKEN is shorter than 32 characters — refusing to " +
        "provision it. Generate one with: openssl rand -hex 32",
    );
    return;
  }

  const service = strapi.service("admin::api-token") as {
    hash: (key: string) => string;
  };
  const accessKeyHash = service.hash(accessKey);

  const existing = await strapi.db
    .query("admin::api-token")
    .findOne({ where: { name: READONLY_TOKEN_NAME } });

  if (existing) {
    // Re-key in place if the env token was rotated; leave it alone otherwise so
    // a boot is not a write.
    if (existing.accessKey !== accessKeyHash || existing.type !== "read-only") {
      await strapi.db.query("admin::api-token").update({
        where: { id: existing.id },
        data: {
          accessKey: accessKeyHash,
          type: "read-only",
          // `kind` gates the auth strategy: `content-api-token` rejects anything
          // that is neither `content-api` nor legacy-null.
          kind: "content-api",
          lifespan: null,
          expiresAt: null,
        },
      });
      strapi.log.info(`[bootstrap] re-keyed read-only API token "${READONLY_TOKEN_NAME}"`);
    }
    return;
  }

  await strapi.db.query("admin::api-token").create({
    data: {
      name: READONLY_TOKEN_NAME,
      description:
        "Read-only Content-API token used by apps/web for RSC rendering (provisioned from env).",
      type: "read-only",
      kind: "content-api",
      accessKey: accessKeyHash,
      lifespan: null,
      expiresAt: null,
    },
  });
  strapi.log.info(`[bootstrap] provisioned read-only API token "${READONLY_TOKEN_NAME}"`);
}

async function ensurePreviewApiToken(strapi: Core.Strapi): Promise<void> {
  const accessKey = process.env.STRAPI_PREVIEW_TOKEN;
  if (!accessKey) return;

  if (accessKey.length < 32) {
    strapi.log.error(
      "[bootstrap] STRAPI_PREVIEW_TOKEN is shorter than 32 characters — refusing to " +
        "provision it. Generate one with: openssl rand -hex 32",
    );
    return;
  }

  const service = strapi.service("admin::api-token") as {
    hash: (key: string) => string;
  };
  const accessKeyHash = service.hash(accessKey);

  const existing = await strapi.db
    .query("admin::api-token")
    .findOne({ where: { name: PREVIEW_TOKEN_NAME } });

  if (existing) {
    if (existing.accessKey !== accessKeyHash || existing.type !== "full-access") {
      await strapi.db.query("admin::api-token").update({
        where: { id: existing.id },
        data: {
          accessKey: accessKeyHash,
          type: "full-access",
          kind: "content-api",
          lifespan: null,
          expiresAt: null,
        },
      });
      strapi.log.info(`[bootstrap] re-keyed preview API token "${PREVIEW_TOKEN_NAME}"`);
    }
    return;
  }

  await strapi.db.query("admin::api-token").create({
    data: {
      name: PREVIEW_TOKEN_NAME,
      description:
        "Full-access Preview API token used by apps/web for draft rendering (provisioned from env).",
      type: "full-access",
      kind: "content-api",
      accessKey: accessKeyHash,
      lifespan: null,
      expiresAt: null,
    },
  });
  strapi.log.info(`[bootstrap] provisioned preview API token "${PREVIEW_TOKEN_NAME}"`);
}

/**
 * Apply the configured Content-API access model. Called from `bootstrap()`.
 */
export async function ensureContentApiAccess(strapi: Core.Strapi): Promise<void> {
  await ensureReadOnlyApiToken(strapi);
  await ensurePreviewApiToken(strapi);

  if (publicReadEnabled(strapi)) {
    await grantPublicRead(strapi);
    return;
  }

  await revokePublicRead(strapi);

  if (!process.env.STRAPI_READONLY_API_TOKEN) {
    strapi.log.warn(
      "[bootstrap] Content API is token-authenticated but STRAPI_READONLY_API_TOKEN is not set. " +
        "Create a read-only token in the admin (Settings → API Tokens) and set it as " +
        "STRAPI_API_TOKEN on apps/web, or the site will render empty pages.",
    );
  }
}

/**
 * @deprecated Kept as a named alias so an out-of-date caller fails at type-check
 * rather than silently skipping the new revocation path.
 */
export const ensurePublicReadPermissions = ensureContentApiAccess;
