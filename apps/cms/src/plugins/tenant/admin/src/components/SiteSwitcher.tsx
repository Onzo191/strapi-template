import { Box, Flex, SingleSelect, SingleSelectOption, Typography } from "@strapi/design-system";
import { useNotification } from "@strapi/strapi/admin";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, type MyContext, useTenantApi } from "../utils/api";

/**
 * Injected into the content-manager list view. Switching site is a server-side
 * change (`POST /tenant/me/active-site`) — the value decides which tenant new
 * entries are filed under, so it cannot live in `localStorage` where the server
 * could not see it.
 *
 * The list itself is filtered by the RBAC condition, which reads the same
 * assignments; the page is reloaded after a switch so the content manager
 * re-runs its queries under the new scope.
 */
const SiteSwitcher = () => {
  const api = useTenantApi();
  const { toggleNotification } = useNotification();
  const [context, setContext] = useState<MyContext | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setContext(await api.myContext());
    } catch {
      // Non-fatal: without this control the editor still works, they just cannot
      // switch site from here. Failing loudly on every list view would be worse.
      setContext(null);
    }
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  // One site (the common case for an editor) means nothing to switch between.
  if (!context || context.sites.length < 2) return null;

  const change = async (value: string) => {
    setBusy(true);
    try {
      await api.setActiveSite(value);
      window.location.reload();
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: errorMessage(err, "Không chuyển được website."),
      });
      setBusy(false);
    }
  };

  return (
    <Box paddingRight={2}>
      <Flex gap={2} alignItems="center">
        <Typography variant="pi" textColor="neutral600">
          Website
        </Typography>
        <SingleSelect
          aria-label="Website đang làm việc"
          value={context.activeSiteDocumentId ?? ""}
          disabled={busy}
          onChange={(value: string | number) => change(String(value))}
        >
          {context.sites.map((site) => (
            <SingleSelectOption key={site.documentId} value={site.documentId}>
              {site.name}
            </SingleSelectOption>
          ))}
        </SingleSelect>
      </Flex>
    </Box>
  );
};

export { SiteSwitcher };
