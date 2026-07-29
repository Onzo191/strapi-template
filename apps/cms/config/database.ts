/**
 * Postgres connection.
 *
 * Two timezone decisions live here, and together with
 * `src/bootstrap/timestamps.ts` they are what makes "every time value is stored
 * at UTC+0 and carries an offset" true rather than aspirational:
 *
 *  1. **The Node process runs in UTC.** `node-pg` serialises a `Date` using the
 *     process's local offset, and Strapi's `date`/`time` field parsers format
 *     with `date-fns`, which uses the local calendar. Pinning `TZ` to UTC makes
 *     both TZ-independent, so a value written by `strapi develop` on a laptop in
 *     Asia/Ho_Chi_Minh is identical to one written by the container.
 *
 *     Set here, at module scope, because config modules load before Strapi opens
 *     a connection or touches a date — and because assigning `process.env.TZ` at
 *     runtime does reconfigure Node's date handling. `TZ` is also set in
 *     `docker-compose.yml` and `apps/cms/Dockerfile`, so this is the belt to
 *     their braces: it covers the local `pnpm dev` path, which has no container
 *     env to inherit.
 *
 *  2. **Every pooled connection runs in UTC.** `SET TIME ZONE 'UTC'` fixes the
 *     session `TimeZone`, which determines what `now()` and `CURRENT_TIMESTAMP`
 *     return, and the offset Postgres renders `timestamptz` values with. Without
 *     it the session inherits the *server's* `timezone` GUC — a setting owned by
 *     whoever provisioned the RDS parameter group, not by this repo.
 *
 * Deliberately not configurable: a per-environment timezone is precisely the bug
 * this prevents. Storage is UTC everywhere; presenting Asia/Ho_Chi_Minh is the
 * web app's job, at render time.
 */

// See (1) above. Must happen before the first Date is formatted or sent to pg.
process.env.TZ = "UTC";

export default ({ env }) => ({
  connection: {
    client: env("DATABASE_CLIENT", "postgres"),
    connection: {
      host: env("DATABASE_HOST", "localhost"),
      port: env.int("DATABASE_PORT", 5432),
      database: env("DATABASE_NAME", "vng"),
      user: env("DATABASE_USERNAME", "vng"),
      password: env("DATABASE_PASSWORD", "vng"),
      ssl: env.bool("DATABASE_SSL", false) && {
        rejectUnauthorized: env.bool("DATABASE_SSL_REJECT_UNAUTHORIZED", true),
      },
      schema: env("DATABASE_SCHEMA", "public"),
    },
    pool: {
      min: env.int("DATABASE_POOL_MIN", 2),
      max: env.int("DATABASE_POOL_MAX", 10),
      // See (2) above. Runs once per physical connection, before the pool hands
      // it out. Reporting the error to `done` discards the connection rather than
      // letting a session with the wrong timezone serve queries.
      afterCreate: (connection, done) => {
        connection.query("SET TIME ZONE 'UTC'", (err) => done(err, connection));
      },
    },
  },
});
