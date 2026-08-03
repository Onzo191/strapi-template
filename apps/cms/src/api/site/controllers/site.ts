/**
 * Site controller. Sites are administered from the tenant plugin's
 * super-admin-only UI, not from the public Content API — this core controller
 * exists so the content-manager and the delivery layer have the usual routes.
 *
 * Public read permissions are deliberately NOT granted in
 * `src/bootstrap/permissions.ts`: the site list carries the domain map of every
 * tenant, and nothing on the FE needs it until the web phase resolves a site by
 * host (docs/multi-tenancy-plan.md §7.1).
 */
import { factories } from "@strapi/strapi";

export default factories.createCoreController("api::site.site");
