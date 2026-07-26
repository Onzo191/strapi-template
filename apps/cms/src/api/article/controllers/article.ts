/**
 * Article controller — enforces the smart-population strategy (§4.4):
 * `find` returns cards only; `findOne` deep-populates. Population comes from
 * the single source of truth in `@vng/shared`, so the FE typed client and the
 * REST API never drift.
 */
import { factories } from "@strapi/strapi";
import { ARTICLE_CARD_FIELDS } from "@vng/shared";
import { applyDetailPopulate, applyListPopulate } from "../../../utils/populate";

export default factories.createCoreController("api::article.article", () => ({
  async find(ctx) {
    applyListPopulate(ctx, "article");
    ctx.query.fields = [...ARTICLE_CARD_FIELDS];
    return super.find(ctx);
  },

  async findOne(ctx) {
    applyDetailPopulate(ctx, "article");
    return super.findOne(ctx);
  },
}));
