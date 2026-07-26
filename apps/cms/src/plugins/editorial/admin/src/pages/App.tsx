import { Page } from "@strapi/strapi/admin";
import { Route, Routes } from "react-router-dom";
import { AuditLogPage } from "./AuditLog";
import { WorkflowPage } from "./Workflow";

/** Plugin router: workflow board (index) + audit log (`/audit`). */
const App = () => (
  <Routes>
    <Route index element={<WorkflowPage />} />
    <Route path="audit" element={<AuditLogPage />} />
    <Route path="*" element={<Page.Error />} />
  </Routes>
);

export { App };
