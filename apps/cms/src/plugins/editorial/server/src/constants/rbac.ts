/**
 * RBAC for editorial transitions (§4.5, Req §3/§4). Maps the five VNG admin
 * roles to the workflow actions they may perform. The transition service and
 * the `can-transition` policy both enforce this, so a Contributor calling
 * `approve` gets 403 — the headline acceptance criterion.
 *
 * `strapi-super-admin` (the built-in) always passes, and Master Admin is wired
 * to it in bootstrap.
 */

/** Custom admin-role codes provisioned in bootstrap. */
export const ROLE_CODES = {
  masterAdmin: "vng-master-admin",
  admin: "vng-admin",
  editor: "vng-editor",
  contributor: "vng-contributor",
  viewer: "vng-viewer",
} as const;

export const SUPER_ADMIN_CODE = "strapi-super-admin";

export interface RoleSeed {
  code: string;
  name: string;
  description: string;
}

export const ROLE_SEEDS: RoleSeed[] = [
  {
    code: ROLE_CODES.masterAdmin,
    name: "Master Admin",
    description: "Full control incl. all workflow transitions and hard delete.",
  },
  {
    code: ROLE_CODES.admin,
    name: "Admin",
    description: "Manage content and drive every workflow transition.",
  },
  {
    code: ROLE_CODES.editor,
    name: "Editor",
    description: "Submit, approve/reject, publish and archive content.",
  },
  {
    code: ROLE_CODES.contributor,
    name: "Contributor",
    description: "Create drafts and submit them for review (cannot approve).",
  },
  {
    code: ROLE_CODES.viewer,
    name: "Viewer",
    description: "Read-only — no workflow transitions.",
  },
];

const { masterAdmin, admin, editor, contributor } = ROLE_CODES;

/** action → role codes permitted to perform it (super-admin always allowed). */
export const ACTION_ALLOWED_ROLES: Record<string, string[]> = {
  submit: [contributor, editor, admin, masterAdmin],
  approve: [editor, admin, masterAdmin],
  reject: [editor, admin, masterAdmin],
  publish: [editor, admin, masterAdmin],
  unpublish: [editor, admin, masterAdmin],
  archive: [editor, admin, masterAdmin],
  restore: [editor, admin, masterAdmin],
  // Hard delete of content / audit rows: only the most privileged roles.
  hardDelete: [masterAdmin],
};

/** Does any of the actor's role codes permit `action`? */
export function roleCanPerform(roleCodes: string[], action: string): boolean {
  if (roleCodes.includes(SUPER_ADMIN_CODE)) return true;
  const allowed = ACTION_ALLOWED_ROLES[action];
  return Boolean(allowed) && roleCodes.some((code) => allowed.includes(code));
}

/** Actor is a super-admin or Master Admin (used for audit immutability bypass). */
export function isPrivileged(roleCodes: string[]): boolean {
  return roleCodes.includes(SUPER_ADMIN_CODE) || roleCodes.includes(masterAdmin);
}
