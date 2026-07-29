/**
 * Server entrypoint bridge for the local `sso` plugin.
 *
 * ## Why this is a hand-written .js file and not `strapi-server.ts`
 *
 * Strapi resolves a local plugin's server entrypoint as
 *
 *     path.join(path.resolve(strapi.dirs.app.root, <resolve>), <exports["./strapi-server"]>)
 *
 * and `dirs.app.root` is the **project** root (`apps/cms`), whose `src/` tree holds
 * TypeScript. Node cannot `require` a `.ts` file in production, and — the part that
 * makes this dangerous — Strapi's plugin loader `continue`s past a *missing*
 * entrypoint **silently** (`@strapi/core/loaders/plugins/index.ts`). So a `.ts`
 * entrypoint does not fail loudly; the plugin simply never loads, while its admin
 * half still gets bundled at build time.
 *
 * That is exactly how the editorial plugin shipped: menu items present in the admin,
 * every request behind them 404, no audit-log table, and nothing in the logs.
 *
 * So the entrypoint Strapi is pointed at must be plain CommonJS that exists in
 * `src/`, and it forwards to the tree `strapi build` compiles into `dist/`. Both
 * `strapi develop` and `strapi start` compile to `dist` before running, so this
 * resolves in every mode.
 *
 * Re-exporting the module object wholesale (rather than `.default`) preserves the
 * `{ __esModule: true, default: … }` shape `loadConfigFile` expects.
 */
module.exports = require("../../../dist/src/plugins/sso/server/src");
