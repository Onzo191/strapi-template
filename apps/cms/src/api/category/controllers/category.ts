/**
 * Category controller — `findOne` populates the category's article cards
 * (§4.4) so a category landing page can render its feed in one request.
 */
import { factories } from "@strapi/strapi";
import { applyDetailPopulate } from "../../../utils/populate";

export default factories.createCoreController("api::category.category", () => ({
  async findOne(ctx) {
    applyDetailPopulate(ctx, "category");
    return super.findOne(ctx);
  },
}));
