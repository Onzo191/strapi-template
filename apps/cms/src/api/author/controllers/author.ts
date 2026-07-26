/**
 * Author controller — lists carry the avatar; detail carries avatar +
 * social links (§4.4).
 */
import { factories } from "@strapi/strapi";
import { applyDetailPopulate, applyListPopulate } from "../../../utils/populate";

export default factories.createCoreController("api::author.author", () => ({
  async find(ctx) {
    applyListPopulate(ctx, "author");
    return super.find(ctx);
  },

  async findOne(ctx) {
    applyDetailPopulate(ctx, "author");
    return super.findOne(ctx);
  },
}));
