/**
 * Population helpers — thin adapters over the smart-population config
 * (§4.4), which is the single source of truth in `@vng/shared`.
 *
 * Controllers call `applyListPopulate` / `applyDetailPopulate` so that list
 * endpoints stay card-shaped and detail endpoints deep-populate, regardless
 * of what the client passes in `ctx.query`.
 */
import { POPULATE, type PopulatableType, type PopulateClause } from "@vng/shared";

type Ctx = { query: Record<string, unknown> };

/** Force the `list` (card) populate for a content type onto the request. */
export function applyListPopulate(ctx: Ctx, type: PopulatableType): void {
  ctx.query = { ...ctx.query, populate: POPULATE[type].list };
}

/** Force the `detail` (deep) populate for a content type onto the request. */
export function applyDetailPopulate(ctx: Ctx, type: PopulatableType): void {
  ctx.query = { ...ctx.query, populate: POPULATE[type].detail };
}

/** Read the detail populate directly (used by services / lifecycle hooks). */
export function detailPopulate(type: PopulatableType): PopulateClause {
  return POPULATE[type].detail;
}
