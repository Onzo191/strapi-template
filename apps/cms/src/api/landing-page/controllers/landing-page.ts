/**
 * Landing-page controller — detail endpoints deep-populate the page-builder
 * dynamic zone per-component (§4.4). Lists stay card-shaped.
 */
import { factories } from "@strapi/strapi";
import { applyDetailPopulate, applyListPopulate } from "../../../utils/populate";

export default factories.createCoreController("api::landing-page.landing-page", () => ({
  async find(ctx) {
    applyListPopulate(ctx, "landing-page");
    ctx.query.fields = ["title", "slug", "publishedAt", "locale"];
    return super.find(ctx);
  },

  async findOne(ctx) {
    applyDetailPopulate(ctx, "landing-page");
    return super.findOne(ctx);
  },
}));
