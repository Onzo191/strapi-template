/**
 * Admin-type routes — reachable only by an authenticated admin user, so
 * `ctx.state.user` (with roles) is always present for the policy below.
 *
 * The split is the requirement, stated plainly: the tenant **console** is super
 * admin only; the two `/me` routes are what every editor needs after logging in.
 */
const superAdminOnly = { policies: ["plugin::tenant.is-super-admin"] };

export default {
  admin: {
    type: "admin",
    routes: [
      // ── Tenant console — SUPER ADMIN ONLY ────────────────────────────────
      { method: "GET", path: "/sites", handler: "sites.find", config: superAdminOnly },
      { method: "POST", path: "/sites", handler: "sites.create", config: superAdminOnly },
      { method: "PUT", path: "/sites/:id", handler: "sites.update", config: superAdminOnly },
      { method: "DELETE", path: "/sites/:id", handler: "sites.remove", config: superAdminOnly },
      { method: "GET", path: "/assignments", handler: "assignments.find", config: superAdminOnly },
      {
        method: "PUT",
        path: "/assignments/:userId",
        handler: "assignments.set",
        config: superAdminOnly,
      },

      // ── The caller's own context — every admin user ──────────────────────
      { method: "GET", path: "/me/sites", handler: "me.sites" },
      { method: "POST", path: "/me/active-site", handler: "me.setActive" },
    ],
  },
};
