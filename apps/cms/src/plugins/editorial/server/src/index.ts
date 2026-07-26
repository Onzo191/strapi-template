/**
 * Editorial plugin — server entry (§4.5/§4.6). Content workflow with RBAC-gated
 * transitions, an immutable/exportable audit log (own table), and soft-delete.
 */
import bootstrap from "./bootstrap";
import contentTypes from "./content-types";
import controllers from "./controllers";
import register from "./register";
import routes from "./routes";
import services from "./services";

export default {
  register,
  bootstrap,
  contentTypes,
  controllers,
  services,
  routes,
};
