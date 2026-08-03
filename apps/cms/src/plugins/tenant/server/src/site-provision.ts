/**
 * Provision the default site and backfill `site` on legacy content.
 *
 * ## Why this runs on every boot rather than as a one-shot migration
 *
 * The `site` relation is `manyToOne`, so it lives in a join table and carries no
 * NOT NULL constraint — Strapi will happily sync the schema with rows that have
 * no site. Those rows are then invisible to every non-super-admin (the tenant
 * condition filters on `site.documentId`) and un-editable in the content manager
 * (the relation is required at the application layer). That is a silent,
 * data-shaped failure, which is exactly the class this codebase asserts against
 * elsewhere (`assert-plugins.ts`).
 *
 * So the backfill is idempotent and unconditional: it costs one indexed query per
 * content type on a healthy boot, and it repairs anything a partial deploy, a
 * restored dump or a manual `INSERT` left unattached.
 *
 * `strapi.db.query` is used rather than the document service on purpose — writing
 * through the document service would re-enter the tenant-scope middleware, which
 * has no request context here and would just wave it through, but would also fire
 * the revalidation webhook and the editorial auto-audit for what is a schema
 * repair, not an editorial act.
 */
import type { Core } from "@strapi/strapi";
import { SITE_UID, TENANT_SCOPED_UIDS } from "./constants";

/** Key/name of the site every pre-multi-tenant row is attached to. */
const DEFAULT_SITE_KEY = process.env.DEFAULT_SITE_KEY?.trim() || "vng";
const DEFAULT_SITE_NAME = process.env.DEFAULT_SITE_NAME?.trim() || "VNG";

interface SiteRow {
  id: number;
  documentId: string;
  key: string;
  name: string;
}

/**
 * The site legacy rows are attached to. Created once; never updated afterwards,
 * so an admin renaming it or changing its domains is not clobbered on reboot.
 */
async function ensureDefaultSite(strapi: Core.Strapi): Promise<SiteRow> {
  const existing = (await strapi.db.query(SITE_UID).findOne({
    where: { key: DEFAULT_SITE_KEY },
  })) as SiteRow | null;
  if (existing) return existing;

  // If some *other* site already exists, a human has been here: adopt the oldest
  // one as the default rather than inventing a second one and splitting content
  // across two tenants nobody asked for.
  const anySite = (await strapi.db.query(SITE_UID).findMany({
    orderBy: { id: "asc" },
    limit: 1,
  })) as SiteRow[];
  if (anySite.length > 0) {
    strapi.log.info(
      `[tenant] no site with key "${DEFAULT_SITE_KEY}"; adopting "${anySite[0].key}" as the default.`,
    );
    return anySite[0];
  }

  const defaultLocale = process.env.DEFAULT_LOCALE?.trim() || "vi";
  const created = (await strapi.db.query(SITE_UID).create({
    data: {
      name: DEFAULT_SITE_NAME,
      key: DEFAULT_SITE_KEY,
      domains: [],
      defaultLocale,
      locales: [defaultLocale],
      isActive: true,
    },
  })) as SiteRow;

  strapi.log.info(`[tenant] provisioned default site "${created.key}" (${created.documentId})`);
  return created;
}

/**
 * Attach every site-less row of the tenant-scoped types to `site`.
 *
 * ## Why one `update()` per row instead of a single `updateMany()`
 *
 * `updateMany` cannot write a relation. It runs `data` through `processData`,
 * which keeps only scalar columns, and then throws **"Update requires data"** on
 * the empty result — so the bulk form fails outright rather than silently
 * skipping the link (`@strapi/database/entity-manager`: `updateMany` has a
 * `TODO: where do we handle relation processing for many queries ?` right above
 * it). Only the single-row `update()` calls `updateRelations`.
 *
 * The alternative — inserting into the `*_site_lnk` join tables with raw knex —
 * is faster but hard-codes Strapi's join-table naming, which is exactly the kind
 * of internal detail that breaks on an upgrade. This is a one-time repair whose
 * healthy-boot cost is one query per content type, so the public API wins.
 *
 * Note that this is per *row*, not per document: with Draft & Publish plus i18n a
 * single document is several rows (draft/published × locale) and each carries its
 * own link, so every one of them has to be attached.
 */
async function backfill(strapi: Core.Strapi, site: SiteRow): Promise<void> {
  for (const uid of TENANT_SCOPED_UIDS) {
    // A content type can legitimately be absent (removed between deploys); the
    // repair loop must not be the thing that stops the boot.
    if (!strapi.contentType(uid as never)) continue;

    const orphans = (await strapi.db.query(uid).findMany({
      where: { site: null },
      select: ["id"],
    })) as Array<{ id: number }>;
    if (orphans.length === 0) continue;

    let attached = 0;
    for (const row of orphans) {
      try {
        await strapi.db.query(uid).update({ where: { id: row.id }, data: { site: site.id } });
        attached += 1;
      } catch (err) {
        // Report and keep going: one unattachable row must not stop the boot and
        // leave every *other* row un-tenanted too.
        strapi.log.error(
          `[tenant] could not attach ${uid} id=${row.id} to site "${site.key}": ${
            (err as Error).message
          }`,
        );
      }
    }
    strapi.log.info(
      `[tenant] backfilled ${attached}/${orphans.length} ${uid} row(s) → site "${site.key}"`,
    );
  }
}

/**
 * Ensure a default site exists and that no content row is left un-tenanted.
 * Called from `bootstrap()` before the HTTP server accepts traffic.
 */
export async function ensureSites(strapi: Core.Strapi): Promise<SiteRow> {
  const site = await ensureDefaultSite(strapi);
  await backfill(strapi, site);
  return site;
}
