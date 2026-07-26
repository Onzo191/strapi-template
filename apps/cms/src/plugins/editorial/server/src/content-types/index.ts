import lifecycles from "./audit-log/lifecycles";
import auditLogSchema from "./audit-log/schema.json";

export default {
  "audit-log": { schema: auditLogSchema, lifecycles },
};
