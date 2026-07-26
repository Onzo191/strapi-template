import { Pencil } from "@strapi/icons";
import { StatusControl } from "./components/StatusControl";
import { PLUGIN_ID } from "./pluginId";

/**
 * Editorial plugin — admin entry (§4.5). Registers two menu links (workflow
 * board + audit log) and injects the status control into the content-manager
 * edit view.
 */
// biome-ignore lint/suspicious/noExplicitAny: Strapi admin app type is not exported as a stable public type
type StrapiApp = any;

const loadApp = async () => {
  const { App } = await import("./pages/App");
  return App;
};

export default {
  register(app: StrapiApp) {
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}`,
      icon: Pencil,
      intlLabel: { id: `${PLUGIN_ID}.menu.workflow`, defaultMessage: "Editorial Workflow" },
      Component: loadApp,
    });
    app.addMenuLink({
      to: `plugins/${PLUGIN_ID}/audit`,
      icon: Pencil,
      intlLabel: { id: `${PLUGIN_ID}.menu.audit`, defaultMessage: "Editorial Audit" },
      Component: loadApp,
    });
    app.registerPlugin({ id: PLUGIN_ID, name: PLUGIN_ID });
  },

  bootstrap(app: StrapiApp) {
    // Inject the status control into the edit view's right panel.
    const contentManager = app.getPlugin("content-manager");
    contentManager?.injectComponent?.("editView", "right-links", {
      name: `${PLUGIN_ID}-status`,
      Component: StatusControl,
    });
  },

  async registerTrads() {
    return [];
  },
};
