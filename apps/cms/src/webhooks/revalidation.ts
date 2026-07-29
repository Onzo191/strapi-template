/**
 * Revalidation webhook (§5.3, §4.6) — the CMS half of instant content freshness.
 *
 * A Strapi 5 **document-service middleware** is the right hook here (not a
 * per-model DB lifecycle): it fires once per document action with the
 * `documentId` + locale, and — crucially — distinguishes `publish` /
 * `unpublish` from plain `update`, which the requirement calls out explicitly.
 * It's inline custom code (no admin UI, no tables) per the §4.6 ladder.
 *
 * On each watched action we POST `{ model, documentId, slug, locale, ... }` to
 * the web app's `/api/revalidate`, signed with a shared-secret HMAC. The web
 * side maps the entry to cache tags and calls `revalidateTag()` — no rebuild.
 *
 * Delivery is best-effort with retry so a transient web/network blip doesn't
 * lose an invalidation; the FE's time-based `cacheLife` (§5.1) is the ultimate
 * safety net if every retry still fails.
 */
import { createHmac } from "node:crypto";
import type { Core } from "@strapi/strapi";
import {
  type RevalidateModel,
  type RevalidatePayload,
  SIGNATURE_HEADER,
  signingPayload,
  TIMESTAMP_HEADER,
} from "@vng/shared";

/** Content types whose changes must invalidate FE cache, mapped uid → model. */
const WATCHED_MODELS: Record<string, RevalidateModel> = {
  "api::article.article": "article",
  "api::landing-page.landing-page": "landing-page",
  "api::page.page": "page",
  "api::category.category": "category",
  "api::tag.tag": "tag",
  "api::navigation.navigation": "navigation",
  "api::global.global": "global",
};

/** Document-service actions that can change what the FE renders. */
const WATCHED_ACTIONS = new Set([
  "create",
  "update",
  "delete",
  "publish",
  "unpublish",
  "discardDraft",
]);

const MAX_ATTEMPTS = 3;

interface EntryLike {
  id?: number | string;
  documentId?: string;
  slug?: string;
  locale?: string;
  category?: { slug?: string } | null;
  tags?: Array<{ slug?: string }> | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Normalise any document-action result into the list of affected entries. */
function collectEntries(
  params: { documentId?: string; locale?: string },
  result: unknown,
): EntryLike[] {
  // publish/unpublish return `{ documentId, entries: [...] }` (one per locale).
  if (
    result &&
    typeof result === "object" &&
    Array.isArray((result as { entries?: unknown }).entries)
  ) {
    const entries = (result as { entries: EntryLike[] }).entries;
    if (entries.length > 0) return entries;
  }
  // create/update/delete/discardDraft return the single document.
  if (result && typeof result === "object" && ("documentId" in result || "id" in result)) {
    return [result as EntryLike];
  }
  // Fallback: at least invalidate by what the caller targeted.
  return [{ documentId: params?.documentId, locale: params?.locale }];
}

function buildPayload(
  model: RevalidateModel,
  entry: EntryLike,
  fallbackDocumentId?: string,
): RevalidatePayload {
  const payload: RevalidatePayload = {
    model,
    documentId: entry.documentId ?? fallbackDocumentId,
    id: entry.id,
    slug: entry.slug,
    locale: entry.locale,
  };
  // Enrich articles with relation slugs when the action populated them (§5.2).
  // Relations arrive in different shapes depending on the caller (content API
  // vs. content-manager may hand back a `{ count }` object rather than an
  // array), so only read them when they're actually the expected shape.
  if (model === "article") {
    if (entry.category && typeof entry.category === "object" && entry.category.slug) {
      payload.categorySlug = entry.category.slug;
    }
    if (Array.isArray(entry.tags)) {
      const tagSlugs = entry.tags.map((t) => t?.slug).filter((s): s is string => Boolean(s));
      if (tagSlugs.length > 0) payload.tagSlugs = tagSlugs;
    }
  }
  return payload;
}

async function deliver(
  strapi: Core.Strapi,
  url: string,
  secret: string,
  payload: RevalidatePayload,
): Promise<void> {
  const body = JSON.stringify(payload);
  // The timestamp is signed *with* the body (P7): a bare timestamp header the
  // HMAC didn't cover could simply be rewritten by whoever replays the request,
  // and each replay costs the FE a cluster-wide purge plus a regeneration storm.
  // Stamped once per delivery, not per attempt, so a retry that lands 500 ms
  // later still verifies against the same signature.
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = `sha256=${createHmac("sha256", secret)
    .update(signingPayload(timestamp, body))
    .digest("hex")}`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [SIGNATURE_HEADER]: signature,
          [TIMESTAMP_HEADER]: timestamp,
        },
        body,
      });
      if (res.ok) {
        strapi.log.info(
          `[revalidate] sent model=${payload.model} documentId=${payload.documentId ?? "-"} ` +
            `locale=${payload.locale ?? "-"} (attempt ${attempt})`,
        );
        return;
      }
      strapi.log.warn(
        `[revalidate] web returned ${res.status} (attempt ${attempt}/${MAX_ATTEMPTS})`,
      );
    } catch (err) {
      strapi.log.warn(
        `[revalidate] delivery failed (attempt ${attempt}/${MAX_ATTEMPTS}): ${(err as Error).message}`,
      );
    }
    if (attempt < MAX_ATTEMPTS) await sleep(250 * 2 ** (attempt - 1));
  }
  strapi.log.error(
    `[revalidate] gave up after ${MAX_ATTEMPTS} attempts for model=${payload.model} ` +
      `documentId=${payload.documentId ?? "-"} — relying on time-based safety net`,
  );
}

/**
 * Register the document-service middleware. Call once from `register()`.
 */
export function registerRevalidationWebhook(strapi: Core.Strapi): void {
  const url = process.env.WEB_REVALIDATE_URL;
  const secret = process.env.REVALIDATE_SECRET;

  if (!url || !secret) {
    strapi.log.warn(
      "[revalidate] WEB_REVALIDATE_URL and/or REVALIDATE_SECRET not set — " +
        "content-freshness webhooks are DISABLED (FE will rely on time-based revalidation only)",
    );
    return;
  }

  strapi.documents.use(async (context, next) => {
    const result = await next();

    // Everything after `next()` is best-effort: a bug here must NEVER turn a
    // successful content operation into a failed one for the editor. Any error
    // is swallowed + logged; the FE's time-based revalidation is the safety net.
    try {
      const model = WATCHED_MODELS[context.uid];
      if (model && WATCHED_ACTIONS.has(context.action)) {
        const params = context.params as { documentId?: string; locale?: string };
        const entries = collectEntries(params, result);

        // Fire-and-forget so the editor's save is never blocked on the webhook;
        // retry + logging happen inside `deliver`.
        for (const entry of entries) {
          const payload = buildPayload(model, entry, params?.documentId);
          void deliver(strapi, url, secret, payload);
        }
      }
    } catch (err) {
      strapi.log.error(
        `[revalidate] middleware error (content op unaffected): ${(err as Error).message}`,
      );
    }

    return result;
  });

  strapi.log.info(`[revalidate] webhook wired → ${url} (signed, HMAC-SHA256)`);
}
