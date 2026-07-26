/**
 * Admin-type routes — reachable only by authenticated admin users, so
 * `ctx.state.user` (with roles) is always present for the RBAC checks.
 */
export default {
  admin: {
    type: "admin",
    routes: [
      { method: "POST", path: "/transition", handler: "transition.transition" },
      { method: "POST", path: "/trash", handler: "transition.trash" },
      { method: "POST", path: "/restore", handler: "transition.restore" },
      { method: "GET", path: "/audit", handler: "audit.find" },
      { method: "GET", path: "/audit/export", handler: "audit.export" },
      { method: "GET", path: "/workflow", handler: "workflow.board" },
    ],
  },
};
