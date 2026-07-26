/**
 * Global (single type) controller — `find` deep-populates logo, default SEO
 * and social links so the site layout resolves in one request (§4.4).
 */
import { factories } from "@strapi/strapi";
import { applyDetailPopulate } from "../../../utils/populate";

export default factories.createCoreController("api::global.global", () => ({
  async find(ctx) {
    applyDetailPopulate(ctx, "global");
    return super.find(ctx);
  },
}));
