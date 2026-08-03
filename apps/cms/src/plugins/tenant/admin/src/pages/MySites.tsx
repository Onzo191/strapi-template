import { Badge, Box, Button, Card, CardBody, Flex, Grid, Typography } from "@strapi/design-system";
import { Layouts, Page, useNotification } from "@strapi/strapi/admin";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, type MyContext, useTenantApi } from "../utils/api";

/**
 * "My Sites" — the answer to *"đăng nhập xong tôi thao tác được website nào?"*.
 *
 * Visible to every admin user. Picking a site sets the server-side active site,
 * which is what the scope guard stamps onto newly created content — so this is a
 * real state change, not a UI preference. That is also why it is not stored in
 * `localStorage`: the server has to agree with what the screen says.
 */
const MySitesPage = () => {
  const api = useTenantApi();
  const { toggleNotification } = useNotification();
  const [context, setContext] = useState<MyContext | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setContext(await api.myContext());
    } catch (err) {
      toggleNotification({
        type: "warning",
        message: errorMessage(err, "Không tải được danh sách website."),
      });
    }
  }, [api, toggleNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const choose = async (documentId: string) => {
    setBusy(true);
    try {
      await api.setActiveSite(documentId);
      toggleNotification({ type: "success", message: "Đã chuyển website đang làm việc." });
      await load();
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: errorMessage(err, "Không chuyển được website."),
      });
    } finally {
      setBusy(false);
    }
  };

  if (!context) return <Page.Loading />;

  return (
    <Layouts.Root>
      <Layouts.Header
        title="Website của tôi"
        subtitle={
          context.isSuperAdmin
            ? "Bạn là Super Admin — truy cập được mọi website."
            : "Các website bạn được phân quyền thao tác."
        }
      />
      <Layouts.Content>
        {context.sites.length === 0 ? (
          <Box padding={8} background="neutral0" hasRadius>
            <Typography variant="delta">Bạn chưa được phân quyền website nào.</Typography>
            <Box paddingTop={2}>
              <Typography textColor="neutral600">
                Liên hệ Super Admin để được cấp quyền truy cập.
              </Typography>
            </Box>
          </Box>
        ) : (
          <Grid.Root gap={4}>
            {context.sites.map((site) => {
              const isActive = site.documentId === context.activeSiteDocumentId;
              return (
                <Grid.Item key={site.documentId} col={4} s={12}>
                  <Card>
                    <CardBody>
                      <Flex direction="column" alignItems="stretch" gap={2} width="100%">
                        <Flex justifyContent="space-between" alignItems="center">
                          <Typography variant="delta">{site.name}</Typography>
                          {isActive ? <Badge active>Đang làm việc</Badge> : null}
                        </Flex>
                        <Typography variant="pi" textColor="neutral600">
                          {site.key}
                          {site.defaultLocale ? ` · ${site.defaultLocale}` : ""}
                        </Typography>
                        <Typography variant="pi" textColor="neutral600">
                          {(site.domains ?? []).join(", ") || "chưa gắn domain"}
                        </Typography>
                        <Box paddingTop={2}>
                          <Button
                            fullWidth
                            variant={isActive ? "tertiary" : "default"}
                            disabled={isActive || busy}
                            onClick={() => choose(site.documentId)}
                          >
                            {isActive ? "Đang chọn" : "Làm việc trên website này"}
                          </Button>
                        </Box>
                      </Flex>
                    </CardBody>
                  </Card>
                </Grid.Item>
              );
            })}
          </Grid.Root>
        )}
      </Layouts.Content>
    </Layouts.Root>
  );
};

export { MySitesPage };
