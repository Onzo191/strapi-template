/**
 * Gate for the tenant console (L4).
 *
 * The requirement is explicit: only a super admin may see or touch the
 * site/assignment screens. The admin UI hides the menu entry behind
 * `plugin::tenant.manage`, but a hidden menu entry is a hidden menu entry — the
 * URL is still typeable and the endpoints are still reachable. This is the check
 * that actually decides.
 *
 * `SUPER_ADMIN_CODE` is imported from the editorial plugin rather than redefined,
 * so role identity has one definition in the codebase (ADR-004 deliberately put
 * the RBAC matrix in a single file for the same reason).
 */
import { SUPER_ADMIN_CODE } from "../../../../editorial/server/src/constants/rbac";

interface PolicyContext {
  state?: { user?: { roles?: Array<{ code?: string }> } };
}

export default (policyContext: PolicyContext): boolean => {
  const codes = (policyContext.state?.user?.roles ?? []).map((role) => role?.code);
  return codes.includes(SUPER_ADMIN_CODE);
};
