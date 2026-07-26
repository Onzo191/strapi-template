/**
 * Tag controller — `findOne` populates the tag's article cards (§4.4).
 */
import { factories } from "@strapi/strapi";
import { applyDetailPopulate } from "../../../utils/populate";

export default factories.createCoreController("api::tag.tag", () => ({
  async findOne(ctx) {
    applyDetailPopulate(ctx, "tag");
    return super.findOne(ctx);
  },
}));
