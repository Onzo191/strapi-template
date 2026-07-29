/**
 * Auto-audit middleware (§4.5 / Req §5: "log tạo/sửa/xóa/duyệt"). A single
 * document-service middleware records create/update/delete/publish/unpublish/
 * rollback of the governed content types, mirroring the P3 revalidation hook
 * pattern. Runs *after* `next()` and swallows its own errors so a bug here can
 * never fail an editor's save. Explicit transitions suppress this via
 * `runWithoutAutoAudit` so they don't double-log.
 */
import type { Core } from "@strapi/strapi";
import { isAutoAuditSuppressed } from "./audit-context";
import { isWorkflowUid } from "./constants/transitions";

/** Document-service action → audit action label. */
const ACTION_LABELS: Record<string, string> = {
  create: "create",
  update: "update",
  delete: "delete",
  publish: "publish",
  unpublish: "unpublish",
  discardDraft: "rollback",
};

export default ({ strapi }: { strapi: Core.Strapi }) => {
  strapi.documents.use(async (context, next) => {
    const result = await next();

    try {
      const label = ACTION_LABELS[context.action];
      if (label && isWorkflowUid(context.uid) && !isAutoAuditSuppressed()) {
        const params = (context.params ?? {}) as { documentId?: string; locale?: string };
        // biome-ignore lint/suspicious/noExplicitAny: loosely-typed doc result
        const res = result as any;
        const user = strapi.requestContext.get()?.state?.user as
          | { id?: number; email?: string; firstname?: string; lastname?: string }
          | undefined;

        await strapi
          .plugin("editorial")
          .service("audit")
          .record({
            action: label,
            contentType: context.uid,
            entryDocumentId: params.documentId ?? res?.documentId ?? null,
            locale: params.locale ?? null,
            actorId: user?.id ?? null,
            actorEmail: user?.email ?? null,
            actorName: [user?.firstname, user?.lastname].filter(Boolean).join(" ").trim() || null,
          });
      }
    } catch (err) {
      strapi.log.error(
        `[editorial] auto-audit failed (content op unaffected): ${(err as Error).message}`,
      );
    }

    return result;
  });

  strapi.log.info("[editorial] auto-audit middleware wired");
};
