/**
 * Tenant plugin — server entry (docs/multi-tenancy-plan.md).
 *
 * Multi-site content scoping on Strapi Community: an RBAC condition that filters
 * the content manager, a document-service guard that enforces the same rule
 * everywhere else, a user↔site assignment table, and a super-admin-only console.
 */
import bootstrap from "./bootstrap";
import contentTypes from "./content-types";
import controllers from "./controllers";
import policies from "./policies";
import register from "./register";
import routes from "./routes";
import services from "./services";

export default {
  register,
  bootstrap,
  contentTypes,
  controllers,
  services,
  policies,
  routes,
};
