/**
 * Page controller — detail deep-populates the page-builder dynamic zone
 * per-component (§4.4); lists stay card-shaped.
 */
import { factories } from "@strapi/strapi";
import { applyDetailPopulate, applyListPopulate } from "../../../utils/populate";

export default factories.createCoreController("api::page.page", () => ({
  async find(ctx) {
    applyListPopulate(ctx, "page");
    ctx.query.fields = ["title", "slug", "publishedAt", "locale"];
    return super.find(ctx);
  },

  async findOne(ctx) {
    applyDetailPopulate(ctx, "page");
    return super.findOne(ctx);
  },
}));
