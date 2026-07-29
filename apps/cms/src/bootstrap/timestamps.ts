import type { Core } from "@strapi/strapi";
import type { Knex } from "knex";

/**
 * Make every timestamp column in the CMS database timezone-aware, storing UTC+0.
 *
 * ## The problem this fixes
 *
 * Strapi hard-codes `useTz: false` for its `datetime` and `timestamp` attribute
 * types (`@strapi/database` schema/schema.js), so every column it creates —
 * `created_at`, `updated_at`, `published_at`, our `publishedAt` overrides, the
 * audit log's `timestamp`, `strapi_sessions.expires_at`, everything — is
 * `timestamp WITHOUT time zone`. A naive column stores wall-clock digits and no
 * offset, and the offset that gets discarded is *the Node process's*:
 *
 *   - On write, `node-pg` serialises a `Date` with the local offset appended
 *     (`2026-07-30T07:00:00.000+07:00` for an instant that is 00:00 UTC). A
 *     `timestamp` column parses that and drops the `+07:00`, storing `07:00:00`.
 *   - On read, `node-pg` parses a naive `timestamp` as local time, and Strapi's
 *     `DatetimeField.fromDB` then calls `.toISOString()`.
 *
 * The round trip is self-consistent only while `TZ` never changes. It is already
 * inconsistent today: `docker compose up` runs the container in UTC, while
 * `pnpm --filter @vng/cms dev` on a developer's machine runs in Asia/Ho_Chi_Minh,
 * so the same instant is stored seven hours apart depending on who wrote it.
 * Move a deployment between regions, or read the table with any client that is
 * not this process, and every stored timestamp silently reinterprets.
 *
 * ## The fix
 *
 * Convert the columns to `timestamptz`. Postgres then normalises on the way in
 * (the offset is honoured, not discarded) and renders with an explicit offset on
 * the way out, so the stored instant is correct regardless of the writer's
 * timezone — and `config/database.ts` pins the session to UTC, so that offset is
 * always `+00`.
 *
 * ## Why this does not fight Strapi's schema sync
 *
 * Strapi re-inspects the live schema on every boot and would normally ALTER any
 * column that no longer matches its model. It does not here, for two independent
 * reasons — both verified against `@strapi/database` 5.51.0:
 *
 *   1. `dialects/postgresql/schema-inspector.js` reduces `information_schema`'s
 *      `data_type` with `/[^(), ]+/`, which turns *both* `timestamp without time
 *      zone` and `timestamp with time zone` into the root type `timestamp`, and
 *      maps both to `{ type: 'datetime' }`.
 *   2. `schema/diff.js` `diffColumns` compares only `type`, `notNullable`,
 *      `defaultTo` and `unsigned`. Column `args` — where `useTz` lives — are
 *      explicitly not compared ("NOTE: compare args at some point").
 *
 * So a converted column reads back as an unchanged `datetime` and the diff is
 * empty. This is a real dependency on Strapi internals, which is why
 * `assertNoNaiveTimestampsRemain` below re-checks the outcome on every boot
 * instead of trusting it.
 *
 * ## Timing
 *
 * Runs on `strapi::content-types.afterSync`: after `db.schema.sync()` has created
 * any new columns (so a content type added today is converted on the same boot
 * that creates it) and before the plugin `bootstrap()`s write their first rows.
 * It is idempotent — it only ever looks at columns that are still naive — so the
 * steady-state cost is one `information_schema` query per boot.
 */

/** `information_schema.columns.data_type` for a naive timestamp column. */
const NAIVE_TIMESTAMP = "timestamp without time zone";

type NaiveColumn = { table_name: string; column_name: string };

/**
 * How to interpret the wall-clock digits already sitting in naive columns.
 *
 * Defaults to UTC, which is right for a database only ever written by a
 * container running in UTC. A database that was written by `strapi develop` on a
 * developer's machine holds local wall-clock instead — set
 * `DB_LEGACY_TIME_ZONE=Asia/Ho_Chi_Minh` for that one conversion run, or the
 * existing rows shift by the offset.
 *
 * Only affects rows that already exist: once a column is `timestamptz` this is
 * never consulted again.
 */
function legacyTimeZone(): string {
  return process.env.DB_LEGACY_TIME_ZONE?.trim() || "UTC";
}

/**
 * Postgres string literal. Zone names come from env, so escape rather than trust.
 */
function quoteLiteral(value: string): string {
  // `replace` with a global regex, not `replaceAll`: Strapi's tsconfig preset
  // targets a lib older than ES2021.
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Postgres quoted identifier. The names passed here come straight out of
 * `information_schema`, so they already exist — but ALTER TABLE cannot be
 * parameterised, so they are still quoted rather than interpolated bare.
 */
function quoteIdent(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

async function findNaiveTimestampColumns(
  db: Knex | Knex.Transaction,
  schema: string,
): Promise<NaiveColumn[]> {
  const result = await db.raw(
    `SELECT c.table_name, c.column_name
       FROM information_schema.columns c
       JOIN information_schema.tables t
         ON t.table_schema = c.table_schema
        AND t.table_name = c.table_name
      WHERE c.table_schema = ?
        AND c.data_type = ?
        AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.column_name`,
    [schema, NAIVE_TIMESTAMP],
  );

  return (result?.rows ?? []) as NaiveColumn[];
}

/**
 * Convert one column in place.
 *
 * When the legacy zone is UTC the plain cast is used deliberately: with the
 * session timezone pinned to UTC, Postgres 12+ recognises
 * `timestamp -> timestamptz` as offset-preserving and skips the table rewrite,
 * turning this into a catalogue-only change. An explicit `USING` expression
 * always forces a rewrite, so it is reserved for the non-UTC case where the
 * values genuinely need shifting.
 */
async function convertColumn(
  trx: Knex.Transaction,
  schema: string,
  column: NaiveColumn,
  sourceZone: string,
) {
  const table = `${quoteIdent(schema)}.${quoteIdent(column.table_name)}`;
  const columnRef = quoteIdent(column.column_name);

  const using =
    sourceZone === "UTC" ? "" : ` USING ${columnRef} AT TIME ZONE ${quoteLiteral(sourceZone)}`;

  await trx.raw(`ALTER TABLE ${table} ALTER COLUMN ${columnRef} TYPE timestamptz(6)${using}`);
}

/**
 * Verify the invariant actually holds, and say so loudly if it does not.
 *
 * A silent regression here is the bad outcome: timestamps would keep being
 * written, keep looking plausible, and be wrong by an offset. So this runs on
 * every boot rather than only after a conversion.
 */
function assertNoNaiveTimestampsRemain(remaining: NaiveColumn[]) {
  if (remaining.length === 0) return;

  const sample = remaining
    .slice(0, 10)
    .map((c) => `${c.table_name}.${c.column_name}`)
    .join(", ");

  throw new Error(
    `[timestamps] ${remaining.length} column(s) are still "${NAIVE_TIMESTAMP}" after conversion ` +
      `(${sample}${remaining.length > 10 ? ", …" : ""}). Timestamps written to them would be ` +
      "stored in the process's local timezone rather than UTC. Either the ALTER failed " +
      "(check the DB user's privileges on these tables) or Strapi reverted the column type — " +
      "see the schema-sync note in apps/cms/src/bootstrap/timestamps.ts.",
  );
}

/** The schema Strapi is pinned to. `getSchemaName()` is unset unless configured. */
async function resolveSchema(strapi: Core.Strapi): Promise<string> {
  const configured = strapi.db.getSchemaName();
  if (configured) return configured;

  const result = await strapi.db.connection.raw("SELECT current_schema() AS schema");
  return (result?.rows?.[0]?.schema as string | undefined) ?? "public";
}

/**
 * Register the convergence step. Call from `register()`; the work happens later,
 * on `strapi::content-types.afterSync`.
 */
export function registerTimestampTimezoneConvergence(strapi: Core.Strapi) {
  strapi.hook("strapi::content-types.afterSync").register(async () => {
    if (strapi.db.dialect.client !== "postgres") {
      // sqlite/mysql store datetimes differently and are not a supported target
      // for this app; loudly skipping beats silently pretending it worked.
      strapi.log.warn(
        `[timestamps] Skipped: timezone-aware timestamps are implemented for Postgres, got ` +
          `"${strapi.db.dialect.client}". Timestamps will be stored in the process's local timezone.`,
      );
      return;
    }

    const schema = await resolveSchema(strapi);
    const sourceZone = legacyTimeZone();

    const naive = await findNaiveTimestampColumns(strapi.db.connection, schema);

    if (naive.length > 0) {
      strapi.log.info(
        `[timestamps] Converting ${naive.length} timestamp column(s) in "${schema}" to timestamptz ` +
          `(existing values interpreted as ${sourceZone})`,
      );

      // Serially and inside one transaction: each statement takes an
      // ACCESS EXCLUSIVE lock on its table, and a half-converted schema is a
      // worse state to restart from than an unconverted one.
      await strapi.db.connection.transaction(async (trx) => {
        for (const column of naive) {
          await convertColumn(trx, schema, column, sourceZone);
        }
      });
    }

    assertNoNaiveTimestampsRemain(await findNaiveTimestampColumns(strapi.db.connection, schema));
  });
}
