import { Globe } from "@strapi/icons";
import { SiteSwitcher } from "./components/SiteSwitcher";
import { PLUGIN_ID } from "./pluginId";

/**
 * Tenant plugin — admin entry.
 *
 * Three surfaces:
 *  - **My Sites** (`addMenuLink`): every admin user, the landing point after
 *    login for "which websites can I work on".
 *  - **Sites / Assignments** (`addSettingsLink`): the tenant console, hidden
 *    behind `plugin::tenant.manage` — an action granted to no role, so only a
 *    super admin (who bypasses ability checks) sees it. Hiding is convenience;
 *    the routes are gated by the `is-super-admin` policy on the server.
 *  - **SiteSwitcher**: injected into the content-manager list view.
 */
// biome-ignore lint/suspicious/noExplicitAny: Strapi admin app type is not exported as a stable public type
type StrapiApp = any;

const MANAGE_PERMISSION = [{ action: `plugin::${PLUGIN_ID}.manage`, subject: null }];

const loadApp = async () => {
  const { App } = await import("./pages/App");
  return App;
};

export default {
  register(app: StrapiApp) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: Globe,
      intlLabel: { id: `${PLUGIN_ID}.menu.mySites`, defaultMessage: "Website của tôi" },
      Component: loadApp,
    });

    app.addSettingsLink("global", {
      id: `${PLUGIN_ID}-sites`,
      to: `plugins/${PLUGIN_ID}/sites`,
      intlLabel: { id: `${PLUGIN_ID}.settings.sites`, defaultMessage: "Websites (Tenants)" },
      permissions: MANAGE_PERMISSION,
      Component: loadApp,
    });

    app.addSettingsLink("global", {
      id: `${PLUGIN_ID}-assignments`,
      to: `plugins/${PLUGIN_ID}/assignments`,
      intlLabel: {
        id: `${PLUGIN_ID}.settings.assignments`,
        defaultMessage: "Phân quyền website",
      },
      permissions: MANAGE_PERMISSION,
      Component: loadApp,
    });

    app.registerPlugin({ id: PLUGIN_ID, name: PLUGIN_ID });
  },

  bootstrap(app: StrapiApp) {
    const contentManager = app.getPlugin("content-manager");
    contentManager?.injectComponent?.("listView", "actions", {
      name: `${PLUGIN_ID}-site-switcher`,
      Component: SiteSwitcher,
    });
  },

  async registerTrads() {
    return [];
  },
};
