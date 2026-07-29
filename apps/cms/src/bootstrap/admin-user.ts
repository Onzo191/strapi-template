import type { Core } from "@strapi/strapi";

/**
 * Provision the bootstrap super-admin account from the environment.
 *
 * A freshly reset database has no admin user, so the admin panel opens on the
 * "create first administrator" form and nothing — not the seed, not an e2e run —
 * can authenticate until a human fills it in. This makes `docker compose up` on an
 * empty volume produce a usable CMS, the same way `ensureContentApiAccess`
 * provisions the read-only API token and `ensureLocales` provisions vi/en.
 *
 * It is the programmatic equivalent of `strapi admin:create-user`: same two
 * services, same `registrationToken: null` (so the account is active immediately
 * rather than pending an invite e-mail), same super-admin role.
 *
 * ## Rules it deliberately follows
 *
 *  - **Create-only, never update.** If an admin with this e-mail already exists it
 *    is left completely alone. If this reset an existing user's password, then
 *    anyone who could set an environment variable would hold a password-reset
 *    primitive against a live CMS — turning a convenience into a backdoor. Rotate
 *    a real password from the admin panel, not from here.
 *  - **No-op unless both e-mail and password are set.** Absence means "don't",
 *    not "use a default"; a hard-coded fallback credential is exactly the kind of
 *    thing that survives into production.
 *  - **The password is never logged**, and the provisioning itself is logged at
 *    WARN because minting a super admin is an audit-relevant event.
 */

/** Strapi's own admin-password policy (`admin:create-user`'s yup schema). */
function passwordComplaint(password: string): string | null {
  if (password.length < 8) return "must be at least 8 characters long";
  if (!/[a-z]/.test(password)) return "must contain at least one lowercase character";
  if (!/[A-Z]/.test(password)) return "must contain at least one uppercase character";
  if (!/\d/.test(password)) return "must contain at least one number";
  return null;
}

type AdminUserService = {
  exists: (attributes: Record<string, unknown>) => Promise<boolean>;
  create: (attributes: Record<string, unknown>) => Promise<{ id: number; email: string }>;
};

type AdminRoleService = {
  getSuperAdmin: () => Promise<{ id: number } | undefined>;
};

export async function ensureBootstrapAdmin(strapi: Core.Strapi): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!email || !password) {
    // Only say something when exactly one half is set — that is a misconfiguration
    // (someone meant to enable this), whereas neither being set is the norm.
    if (email || password) {
      strapi.log.warn(
        "[bootstrap-admin] Ignored: BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must " +
          "both be set to provision the initial admin.",
      );
    }
    return;
  }

  const complaint = passwordComplaint(password);
  if (complaint) {
    // Checked here rather than letting the service reject it, so the log names the
    // rule that failed instead of surfacing a yup error from inside Strapi.
    strapi.log.error(
      `[bootstrap-admin] BOOTSTRAP_ADMIN_PASSWORD ${complaint} — refusing to create ${email}.`,
    );
    return;
  }

  const users = strapi.service("admin::user") as unknown as AdminUserService;
  const roles = strapi.service("admin::role") as unknown as AdminRoleService;

  if (await users.exists({ email })) {
    strapi.log.info(
      `[bootstrap-admin] ${email} already exists — left unchanged (this never resets a password).`,
    );
    return;
  }

  const superAdmin = await roles.getSuperAdmin();
  if (!superAdmin) {
    // The admin plugin's own bootstrap calls `createRolesIfNoneExist()` before user
    // lifecycles run, so this should be unreachable. Fail loudly if it is not:
    // creating the account with no role would produce an admin who cannot do
    // anything, which looks like a login bug rather than a provisioning bug.
    strapi.log.error(
      "[bootstrap-admin] The super-admin role does not exist — cannot provision " +
        `${email}. Create the first administrator through the admin panel instead.`,
    );
    return;
  }

  await users.create({
    email,
    firstname: process.env.BOOTSTRAP_ADMIN_FIRSTNAME?.trim() || "VNG",
    lastname: process.env.BOOTSTRAP_ADMIN_LASTNAME?.trim() || "Admin",
    isActive: true,
    roles: [superAdmin.id],
    password,
    // Without this the service mints a registration token and the account stays
    // in "invited" state, unable to log in with the password we just set.
    registrationToken: null,
  });

  strapi.log.warn(
    `[bootstrap-admin] Created SUPER ADMIN ${email} from BOOTSTRAP_ADMIN_* environment ` +
      "variables. These are first-boot credentials: change the password in the admin " +
      "panel and drop the variables before this environment is anything but local.",
  );
}
