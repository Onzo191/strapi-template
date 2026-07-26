/**
 * Audit service (§4.5 / Req §5). Append-only writer + filterable reader +
 * CSV/JSON exporter over the plugin's own `audit-log` table. Writes go through
 * `strapi.db.query` (not the document service) so they never re-enter the
 * document middleware — no audit-of-audit loop.
 */
import type { Core } from "@strapi/strapi";

const AUDIT_UID = "plugin::editorial.audit-log";

export interface AuditEntry {
  action: string;
  contentType?: string | null;
  documentId?: string | null;
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
  documentId?: string;
  actorEmail?: string;
  from?: string; // ISO date lower bound (timestamp >=)
  to?: string; // ISO date upper bound (timestamp <=)
}

const CSV_COLUMNS = [
  "id",
  "timestamp",
  "action",
  "contentType",
  "documentId",
  "locale",
  "entryTitle",
  "fromStatus",
  "toStatus",
  "actorEmail",
  "actorName",
  "reason",
] as const;

function buildWhere(filters: AuditFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.action) where.action = filters.action;
  if (filters.contentType) where.contentType = filters.contentType;
  if (filters.documentId) where.documentId = filters.documentId;
  if (filters.actorEmail) where.actorEmail = filters.actorEmail;
  if (filters.from || filters.to) {
    where.timestamp = {
      ...(filters.from ? { $gte: filters.from } : {}),
      ...(filters.to ? { $lte: filters.to } : {}),
    };
  }
  return where;
}

function toCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
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

  /** Export all matching rows as CSV or JSON (§4.5: "hỗ trợ xuất file audit"). */
  async exportEntries(filters: AuditFilters, format: "csv" | "json") {
    const rows = await strapi.db.query(AUDIT_UID).findMany({
      where: buildWhere(filters),
      orderBy: { timestamp: "desc" },
      limit: 100000,
    });

    if (format === "json") {
      return {
        body: JSON.stringify(rows, null, 2),
        contentType: "application/json",
        filename: "audit-log.json",
      };
    }

    const header = CSV_COLUMNS.join(",");
    const lines = rows.map((row: Record<string, unknown>) =>
      CSV_COLUMNS.map((col) => toCsvValue(row[col])).join(","),
    );
    return {
      body: [header, ...lines].join("\n"),
      contentType: "text/csv",
      filename: "audit-log.csv",
    };
  },
});
