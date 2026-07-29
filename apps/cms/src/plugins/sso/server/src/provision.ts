/**
 * Map a verified OIDC identity onto a Strapi admin user (Req §8, §4/§4.5 roles).
 *
 * Two modes, chosen by `OIDC_AUTO_PROVISION`:
 *
 * - **off (default)** — the admin user must already exist, created by a Master
 *   Admin. SSO then only *authenticates*; it never grants access. This is the
 *   safe default: with auto-provisioning on and a misconfigured IdP audience,
 *   anyone the IdP can mint a token for gets a CMS account.
 * - **on** — a first-time user is created and assigned roles from their IdP
 *   groups. Intended for a large newsroom where account admin is delegated to the
 *   IdP. `OIDC_ALLOWED_EMAIL_DOMAINS` should always be set in this mode.
 *
 * Role mapping is `OIDC_ROLE_MAP`, e.g.
 *   `VNG-CMS-Publishers:vng-editor,VNG-CMS-Writers:vng-contributor`
 * IdP group → the admin role codes seeded by the editorial plugin
 * (`ROLE_CODES` in `plugins/editorial/.../constants/rbac.ts`).
 *
 * Two rules that matter more than they look:
 *
 * 1. **`strapi-super-admin` is never assignable via SSO.** Otherwise a group name
 *    in the IdP — administered by a different team, on a different change-control
 *    process — would be enough to mint full control of the CMS. Super-admin stays
 *    a deliberate, in-CMS grant.
 * 2. **A user whose groups map to nothing is rejected, not created role-less.** A
 *    role-less admin user is a confusing dead end for the person and an
 *    unaudited account for us.
 */
import type { Core } from "@strapi/strapi";
import { ROLE_CODES, SUPER_ADMIN_CODE } from "../../../editorial/server/src/constants/rbac";
import type { IdTokenClaims, OidcConfig } from "./oidc";

export interface AdminUserLike {
  id: number;
  email: string;
  isActive: boolean;
  roles?: Array<{ id: number; code: string }>;
}

/** Role codes SSO may assign. Deliberately excludes `strapi-super-admin`. */
const ASSIGNABLE_ROLE_CODES = new Set<string>(Object.values(ROLE_CODES));

function parseRoleMap(raw: string | undefined): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const pair of (raw ?? "").split(",")) {
    const [group, ...roles] = pair.split(":");
    const groupName = group?.trim();
    if (!groupName) continue;
    const codes = roles
      .join(":")
      .split(/[|\s]+/)
      .map((code) => code.trim())
      .filter((code) => code && code !== SUPER_ADMIN_CODE && ASSIGNABLE_ROLE_CODES.has(code));
    if (codes.length > 0) map.set(groupName.toLowerCase(), codes);
  }
  return map;
}

function claimGroups(claims: IdTokenClaims, groupsClaim: string): string[] {
  const raw = claims[groupsClaim];
  if (Array.isArray(raw)) return raw.filter((g): g is string => typeof g === "string");
  if (typeof raw === "string") {
    return raw
      .split(/[,\s]+/)
      .map((g) => g.trim())
      .filter(Boolean);
  }
  return [];
}

export class SsoProvisionError extends Error {}

/**
 * Extract and validate the email we key the admin account on.
 *
 * The email is the **entire** account-identity key: `resolveAdminUser` looks up an
 * existing admin by it, so whoever controls this string controls which CMS account
 * the login lands in. Three rules follow from that, and each closes a takeover path:
 *
 * 1. **Only the `email` claim is accepted.** `preferred_username` is deliberately
 *    *not* a fallback. It is a display-oriented claim, frequently user-settable in
 *    the IdP's own profile UI, and not required to be verified — so treating one that
 *    happens to contain `@` as an email address would let a user rename themselves to
 *    a colleague's address and inherit that colleague's CMS account.
 * 2. **`email_verified` must be present and true.** Treating a *missing*
 *    `email_verified` as acceptable is the same hole one step removed: it means
 *    trusting an address the IdP never claimed to have verified. Set
 *    `OIDC_REQUIRE_EMAIL_VERIFIED=false` only for an IdP that provably verifies
 *    addresses out of band and omits the claim.
 * 3. **Domain allow-list**, when configured.
 */
export function resolveEmail(claims: IdTokenClaims, config: OidcConfig): string {
  const email = (claims.email ?? "").toString().trim().toLowerCase();
  if (!email.includes("@")) {
    throw new SsoProvisionError("the IdP did not return a verified email address");
  }

  if (config.requireVerifiedEmail && claims.email_verified !== true) {
    throw new SsoProvisionError("the IdP did not assert that this email address is verified");
  }

  if (config.allowedEmailDomains.length > 0) {
    const domain = email.split("@").pop() ?? "";
    if (!config.allowedEmailDomains.includes(domain)) {
      throw new SsoProvisionError(`email domain "${domain}" is not permitted for CMS access`);
    }
  }
  return email;
}

/**
 * Find (or, when enabled, create) the admin user for this identity and return it.
 * Throws `SsoProvisionError` with a message safe to show the person logging in.
 */
export async function resolveAdminUser(
  strapi: Core.Strapi,
  claims: IdTokenClaims,
  config: OidcConfig,
): Promise<AdminUserLike> {
  const email = resolveEmail(claims, config);

  const existing = (await strapi.db.query("admin::user").findOne({
    where: { email },
    populate: ["roles"],
  })) as AdminUserLike | null;

  if (existing) {
    if (!existing.isActive) {
      throw new SsoProvisionError("this CMS account is disabled");
    }
    await syncRoles(strapi, existing, claims, config);
    return existing;
  }

  if (!config.autoProvision) {
    throw new SsoProvisionError(
      "no CMS account exists for this identity — ask a Master Admin to create one",
    );
  }

  const roleIds = await mapRoleIds(strapi, claims, config);
  if (roleIds.length === 0) {
    throw new SsoProvisionError(
      "your IdP groups do not map to any CMS role — ask a Master Admin for access",
    );
  }

  const created = (await strapi.db.query("admin::user").create({
    data: {
      email,
      firstname: (claims.given_name ?? claims.name ?? email.split("@")[0]) as string,
      lastname: (claims.family_name ?? "") as string,
      isActive: true,
      // No local password: this account can only ever be entered through the IdP.
      // `blocked: false` + no password means the local login form cannot
      // authenticate it, which is the point.
      password: null,
      registrationToken: null,
      roles: roleIds,
    },
    populate: ["roles"],
  })) as AdminUserLike;

  strapi.log.info(`[sso] provisioned admin user ${email} with ${roleIds.length} role(s)`);
  return created;
}

/**
 * Re-apply IdP group → role mapping on every login, so a group removal in the IdP
 * takes effect at next sign-in rather than requiring a manual CMS edit. Skipped
 * entirely when no role map is configured (then the CMS is the source of truth for
 * roles and SSO is authentication only), and never touches a super-admin.
 */
async function syncRoles(
  strapi: Core.Strapi,
  user: AdminUserLike,
  claims: IdTokenClaims,
  config: OidcConfig,
): Promise<void> {
  if (!process.env.OIDC_ROLE_MAP) return;

  const currentCodes = (user.roles ?? []).map((role) => role.code);
  if (currentCodes.includes(SUPER_ADMIN_CODE)) {
    // Never let an IdP group change strip (or grant) super-admin.
    return;
  }

  const roleIds = await mapRoleIds(strapi, claims, config);
  if (roleIds.length === 0) {
    throw new SsoProvisionError(
      "your IdP groups no longer map to any CMS role — access has been withdrawn",
    );
  }

  const currentIds = new Set((user.roles ?? []).map((role) => role.id));
  const desiredIds = new Set(roleIds);
  const unchanged =
    currentIds.size === desiredIds.size && [...desiredIds].every((id) => currentIds.has(id));
  if (unchanged) return;

  await strapi.db.query("admin::user").update({
    where: { id: user.id },
    data: { roles: roleIds },
  });
  strapi.log.info(`[sso] updated roles for ${user.email} from IdP groups`);
}

async function mapRoleIds(
  strapi: Core.Strapi,
  claims: IdTokenClaims,
  config: OidcConfig,
): Promise<number[]> {
  const roleMap = parseRoleMap(process.env.OIDC_ROLE_MAP);
  const groups = claimGroups(claims, config.groupsClaim);

  const wanted = new Set<string>();
  for (const group of groups) {
    for (const code of roleMap.get(group.toLowerCase()) ?? []) wanted.add(code);
  }

  // Fallback role for an authenticated user with no matching group, e.g.
  // `OIDC_DEFAULT_ROLE=vng-viewer`. Unset ⇒ no access, which is the safe default.
  const fallback = process.env.OIDC_DEFAULT_ROLE?.trim();
  if (wanted.size === 0 && fallback && ASSIGNABLE_ROLE_CODES.has(fallback)) {
    wanted.add(fallback);
  }
  if (wanted.size === 0) return [];

  const roles = (await strapi.db.query("admin::role").findMany({
    where: { code: { $in: [...wanted] } },
    select: ["id", "code"],
  })) as Array<{ id: number; code: string }>;

  const missing = [...wanted].filter((code) => !roles.some((role) => role.code === code));
  if (missing.length > 0) {
    strapi.log.warn(
      `[sso] OIDC_ROLE_MAP references admin role code(s) that do not exist: ${missing.join(", ")}`,
    );
  }
  return roles.map((role) => role.id);
}
