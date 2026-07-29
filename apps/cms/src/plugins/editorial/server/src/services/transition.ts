/**
 * Transition service (§4.5) — the single enforcement point for editorial state
 * changes. Rejects illegal transitions (400) and role-forbidden ones (403),
 * applies the status + Draft&Publish side effects, and records exactly one
 * audit entry per transition.
 */
import type { Core } from "@strapi/strapi";
import { errors } from "@strapi/utils";
import { runWithoutAutoAudit } from "../audit-context";
import { roleCanPerform } from "../constants/rbac";
import { type ContentStatus, findTransition, isWorkflowUid } from "../constants/transitions";

interface ActingUser {
  id?: number;
  email?: string;
  firstname?: string;
  lastname?: string;
  roles?: Array<{ code: string }>;
}

export interface TransitionInput {
  uid: string;
  documentId: string;
  locale?: string;
  to: ContentStatus;
  reason?: string;
  user?: ActingUser;
}

function actorName(user?: ActingUser): string | null {
  const name = [user?.firstname, user?.lastname].filter(Boolean).join(" ").trim();
  return name || null;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async transition(input: TransitionInput) {
    const { uid, documentId, locale, to, reason, user } = input;

    if (!isWorkflowUid(uid)) {
      throw new errors.ValidationError(`${uid} is not a workflow-managed content type.`);
    }

    // biome-ignore lint/suspicious/noExplicitAny: Document Input types are excluded from tsconfig
    const current: any = await strapi.documents(uid as never).findOne({
      documentId,
      locale,
      fields: ["contentStatus", "title", "slug"],
      status: "draft",
    });
    if (!current) throw new errors.NotFoundError("Document not found.");

    const from = (current.contentStatus ?? "draft") as ContentStatus;
    const def = findTransition(from, to);
    if (!def) {
      throw new errors.ValidationError(`Illegal transition: ${from} → ${to}.`);
    }

    const roleCodes = (user?.roles ?? []).map((role) => role.code);
    if (!roleCanPerform(roleCodes, def.action)) {
      throw new errors.ForbiddenError(`Your role is not permitted to ${def.action} content.`);
    }

    // A rejection must carry a comment (Req §3: "reject + comment").
    if (def.action === "reject" && !reason?.trim()) {
      throw new errors.ValidationError("A reason is required to reject content.");
    }

    // Apply the status change + native D&P side effects, suppressing the
    // generic auto-audit so this yields exactly one precise transition entry.
    const document = await runWithoutAutoAudit(async () => {
      const data: Record<string, unknown> = { contentStatus: to };
      if (to === "archived") data.trashedAt = new Date();
      if (from === "archived" && to === "draft") data.trashedAt = null;

      // biome-ignore lint/suspicious/noExplicitAny: Document Input types excluded from tsconfig
      const docs = strapi.documents(uid as never) as any;
      const updated = await docs.update({ documentId, locale, data });

      if (to === "published") await docs.publish({ documentId, locale });
      if (to === "archived" || def.action === "unpublish") {
        await docs.unpublish({ documentId, locale });
      }
      return updated;
    });

    await strapi
      .plugin("editorial")
      .service("audit")
      .record({
        action: def.action,
        contentType: uid,
        entryDocumentId: documentId,
        locale: locale ?? null,
        entryTitle: current.title ?? current.slug ?? null,
        actorId: user?.id ?? null,
        actorEmail: user?.email ?? null,
        actorName: actorName(user),
        fromStatus: from,
        toStatus: to,
        reason: reason ?? null,
      });

    return { document, from, to, action: def.action };
  },
});
