/**
 * Legacy-404 → 301 CSV importer (Req §6 — the 297 legacy URLs).
 *
 * Boots Strapi programmatically and UPSERTS each CSV row into the `redirect`
 * content type (idempotent on the unique `from`), so re-running after the
 * content team edits the CSV only adds/updates — never duplicates.
 *
 * Run: `pnpm --filter @vng/cms import:redirects`
 * CSV: apps/cms/data/legacy-404s.csv (columns: from,to,statusCode)
 */

const fs = require("node:fs");
const path = require("node:path");
const { createStrapi, compileStrapi } = require("@strapi/strapi");

const UID = "api::redirect.redirect";
const CSV_PATH = path.join(__dirname, "..", "data", "legacy-404s.csv");

/** Split one CSV line, honouring double-quoted cells. */
function splitCsvLine(line) {
  const cells = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text) {
  const rows = [];
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
  // Drop the header row if present.
  if (lines[0]?.toLowerCase().startsWith("from,")) lines.shift();

  for (const line of lines) {
    const [from, to, statusCode] = splitCsvLine(line).map((cell) => cell.trim());
    if (!from || !to) continue;
    rows.push({ from, to, statusCode: Number(statusCode) || 301 });
  }
  return rows;
}

async function run() {
  if (!fs.existsSync(CSV_PATH)) {
    console.error(`[import-redirects] CSV not found at ${CSV_PATH}`);
    process.exit(1);
  }

  const rows = parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  const appContext = await compileStrapi();
  const app = await createStrapi(appContext).load();
  const docs = app.documents(UID);

  let created = 0;
  let updated = 0;
  for (const row of rows) {
    const permanent = row.statusCode === 301 || row.statusCode === 308;
    const existing = await docs.findMany({ filters: { from: { $eq: row.from } }, limit: 1 });
    const data = { from: row.from, to: row.to, statusCode: row.statusCode, permanent };
    if (existing.length > 0) {
      await docs.update({ documentId: existing[0].documentId, data });
      updated += 1;
    } else {
      await docs.create({ data });
      created += 1;
    }
  }

  app.log.info(
    `[import-redirects] done — ${created} created, ${updated} updated (${rows.length} rows)`,
  );
  await app.destroy();
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
