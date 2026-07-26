/**
 * Immutability guard (§4.5 / Req §5: "log không thể bị xóa bởi user thường").
 * Audit rows are append-only: any update/delete attempt by a non-privileged
 * actor throws. Operations with no request context (migrations, seeds, system
 * maintenance) are allowed so the platform stays operable.
 */
import { errors } from "@strapi/utils";
import { isPrivileged } from "../../constants/rbac";

function assertMutable(operation: "update" | "delete"): void {
  // Strapi injects a global `strapi`; requestContext carries the acting admin.
  // biome-ignore lint/suspicious/noExplicitAny: ambient global provided by Strapi runtime
  const runtime = (globalThis as any).strapi;
  const user = runtime?.requestContext?.get()?.state?.user;
  // No authenticated actor → system/CLI op (seed, migration): permit.
  if (!user) return;
  const roleCodes: string[] = (user.roles ?? []).map((role: { code: string }) => role.code);
  if (isPrivileged(roleCodes)) return;
  throw new errors.ForbiddenError(`Audit log entries are immutable and cannot be ${operation}d.`);
}

export default {
  beforeUpdate() {
    assertMutable("update");
  },
  beforeUpdateMany() {
    assertMutable("update");
  },
  beforeDelete() {
    assertMutable("delete");
  },
  beforeDeleteMany() {
    assertMutable("delete");
  },
};
