import { Page } from "@strapi/strapi/admin";
import { Route, Routes } from "react-router-dom";
import { AssignmentsPage } from "./Assignments";
import { MySitesPage } from "./MySites";
import { SitesPage } from "./Sites";

/**
 * Plugin router. `index` is "My Sites" — reachable by every admin user; the two
 * console screens are super-admin only and are additionally gated server-side by
 * the `is-super-admin` policy, so reaching this route by typing the URL yields a
 * page whose every request 403s.
 */
const App = () => (
  <Routes>
    <Route index element={<MySitesPage />} />
    <Route path="sites" element={<SitesPage />} />
    <Route path="assignments" element={<AssignmentsPage />} />
    <Route path="*" element={<Page.Error />} />
  </Routes>
);

export { App };
