/**
 * Workflow service — feeds the admin workflow board (§4.5). Lists documents of
 * a governed type with their editorial `contentStatus` so the board can group
 * them into columns.
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { isWorkflowUid } from "../constants/transitions";

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async board(params: { uid: string; locale?: string }) {
    const { uid, locale } = params;
    if (!isWorkflowUid(uid)) {
      throw new errors.ValidationError(`${uid} is not a workflow-managed content type.`);
    }

    // biome-ignore lint/suspicious/noExplicitAny: Document Input types excluded from tsconfig
    const docs = strapi.documents(uid as never) as any;
    const items = await docs.findMany({
      locale,
      status: "draft",
      fields: ["title", "slug", "contentStatus", "trashedAt", "updatedAt"],
      sort: "updatedAt:desc",
      pagination: { limit: 500 },
    });

    // biome-ignore lint/suspicious/noExplicitAny: loosely-typed document rows
    return items.map((item: any) => ({
      documentId: item.documentId,
      title: item.title ?? item.slug,
      slug: item.slug,
      contentStatus: item.contentStatus ?? "draft",
      trashedAt: item.trashedAt ?? null,
      locale: item.locale ?? locale ?? null,
      updatedAt: item.updatedAt,
    }));
  },
});
