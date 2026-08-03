/**
 * Fail the boot if a local plugin did not load (P7 §9).
 *
 * ## Why this exists
 *
 * Strapi's plugin loader skips a plugin whose server entrypoint file does not
 * exist — **silently**:
 *
 *   // @strapi/core/loaders/plugins/index.ts
 *   if (!await fse.pathExists(serverEntrypointPath)) {
 *     continue;
 *   }
 *
 * No throw, no warning, not even a debug line. And because a plugin's *admin* half
 * is resolved separately at build time (by Vite, which reads TypeScript happily),
 * the admin panel keeps rendering the plugin's menu items and pages. The result is a
 * CMS that looks complete and is not: every request behind those menu items 404s.
 *
 * That is not hypothetical. The editorial workflow + immutable audit log — a
 * Must-have (Req §3/§5, §4.5) — shipped in exactly that state: menu items present,
 * every API call 404, no `audit_logs` table, nothing in the logs. It was found during
 * this hardening pass by noticing the table was absent, not by anything failing.
 *
 * A missing audit log is a compliance gap that presents as "nobody has used the
 * feature yet". So the absence is asserted at boot instead: a plugin declared in
 * `config/plugins.ts` that did not load stops the container, which surfaces in the
 * ECS deployment health check rather than months later.
 */
import type { Core } from "@strapi/strapi";

/**
 * Local plugins that must be loaded for the platform to be considered functional,
 * with what breaks if they aren't. Keep in sync with `config/plugins.ts`.
 */
const REQUIRED_LOCAL_PLUGINS: Array<{ name: string; provides: string }> = [
  {
    name: "editorial",
    provides:
      "editorial workflow transitions, RBAC gating and the immutable audit log (Req §3/§5, §4.5)",
  },
  {
    name: "sso",
    provides: "admin SSO via OIDC and MFA enforcement (Req §8)",
  },
  {
    // Worse than a missing feature if it silently skips: without the tenant
    // plugin there is no RBAC condition and no scope guard, so every admin user
    // can read and edit every tenant's content — while the admin panel still
    // renders the tenant menu as though scoping were in force.
    name: "tenant",
    provides: "multi-tenant site scoping and user↔site assignment",
  },
];

/**
 * Throw unless every required local plugin is present in `strapi.plugins`.
 *
 * Called from `bootstrap()`, which runs before the HTTP server starts accepting
 * traffic — so a failure here means the container never reports healthy, and a bad
 * deploy rolls back instead of going live half-functional.
 */
export function assertLocalPluginsLoaded(strapi: Core.Strapi): void {
  const missing = REQUIRED_LOCAL_PLUGINS.filter(({ name }) => !strapi.plugin(name));

  if (missing.length === 0) {
    strapi.log.info(
      `[plugins] local plugins loaded: ${REQUIRED_LOCAL_PLUGINS.map((p) => p.name).join(", ")}`,
    );
    return;
  }

  for (const { name, provides } of missing) {
    strapi.log.error(
      `[plugins] local plugin "${name}" did NOT load — ${provides} is unavailable. ` +
        `Check that apps/cms/src/plugins/${name}/strapi-server.js exists and that the ` +
        `package.json "exports"["./strapi-server"] points at it (Strapi resolves the ` +
        `entrypoint from the SOURCE tree, and skips a missing one silently).`,
    );
  }

  throw new Error(
    `Required local plugin(s) failed to load: ${missing.map((p) => p.name).join(", ")}. ` +
      "Refusing to start in a partially-functional state.",
  );
}
