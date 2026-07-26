/**
 * Navigation controller — menus are always consumed whole, so both `find`
 * and `findOne` deep-populate items + children (§4.4).
 */
import { factories } from "@strapi/strapi";
import { applyDetailPopulate } from "../../../utils/populate";

export default factories.createCoreController("api::navigation.navigation", () => ({
  async find(ctx) {
    applyDetailPopulate(ctx, "navigation");
    return super.find(ctx);
  },

  async findOne(ctx) {
    applyDetailPopulate(ctx, "navigation");
    return super.findOne(ctx);
  },
}));
