import { Box, Button, SingleSelect, SingleSelectOption, Typography } from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { STATUS_COLUMNS, useEditorialApi, WORKFLOW_TYPES } from "../utils/api";

/**
 * Injected into the content-manager edit view (§4.5). Lets an editor drive the
 * workflow in place. The server validates the actual current status and RBAC,
 * so an illegal or forbidden target simply surfaces as a toast — the UI can
 * offer every status without needing to know the current one.
 */
const StatusControl = () => {
  const { slug, id } = useParams();
  const [searchParams] = useSearchParams();
  const api = useEditorialApi();
  const { toggleNotification } = useNotification();
  const [to, setTo] = useState<string>("review");
  const [busy, setBusy] = useState(false);

  const uid = slug ?? "";
  // Only for governed types, and not on the "create" (unsaved) screen.
  if (!id || id === "create" || !WORKFLOW_TYPES.some((t) => t.uid === uid)) return null;

  const locale = searchParams.get("plugins[i18n][locale]") ?? undefined;

  const submit = async () => {
    setBusy(true);
    try {
      await api.transition({ uid, documentId: id, locale, to });
      toggleNotification({ type: "success", message: `Editorial status → ${to}` });
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "Transition not allowed.";
      toggleNotification({ type: "danger", message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box>
      <Typography variant="sigma" textColor="neutral600">
        Editorial status
      </Typography>
      <Box paddingTop={2}>
        <SingleSelect aria-label="Target status" value={to} onChange={(v) => setTo(String(v))}>
          {STATUS_COLUMNS.map((status) => (
            <SingleSelectOption key={status} value={status}>
              {status}
            </SingleSelectOption>
          ))}
        </SingleSelect>
      </Box>
      <Box paddingTop={2}>
        <Button fullWidth loading={busy} onClick={submit}>
          Change status
        </Button>
      </Box>
    </Box>
  );
};

export { StatusControl };
