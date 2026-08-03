import {
  Box,
  Button,
  Field,
  Flex,
  Modal,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Toggle,
  Tr,
  Typography,
} from "@strapi/design-system";
import { Layouts, Page, useNotification } from "@strapi/strapi/admin";
import { useCallback, useEffect, useState } from "react";
import { errorMessage, type Site, useTenantApi } from "../utils/api";

interface Draft {
  documentId?: string;
  name: string;
  key: string;
  domains: string;
  defaultLocale: string;
  locales: string;
  isActive: boolean;
}

const EMPTY: Draft = {
  name: "",
  key: "",
  domains: "",
  defaultLocale: "vi",
  locales: "vi, en",
  isActive: true,
};

const toList = (raw: string): string[] =>
  raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

/**
 * Tenant console — sites. Super admin only, enforced by the `is-super-admin`
 * policy on every route this page calls; the menu entry is merely hidden.
 */
const SitesPage = () => {
  const api = useTenantApi();
  const { toggleNotification } = useNotification();
  const [sites, setSites] = useState<Site[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSites(await api.sites());
    } catch (err) {
      toggleNotification({
        type: "warning",
        message: errorMessage(err, "Không tải được danh sách website."),
      });
    } finally {
      setLoading(false);
    }
  }, [api, toggleNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!draft) return;
    const payload = {
      name: draft.name,
      key: draft.key || undefined,
      domains: toList(draft.domains),
      defaultLocale: draft.defaultLocale,
      locales: toList(draft.locales),
      isActive: draft.isActive,
    };
    try {
      if (draft.documentId) await api.updateSite(draft.documentId, payload);
      else await api.createSite(payload);
      toggleNotification({ type: "success", message: "Đã lưu website." });
      setDraft(null);
      await load();
    } catch (err) {
      toggleNotification({ type: "danger", message: errorMessage(err, "Không lưu được website.") });
    }
  };

  const remove = async (site: Site) => {
    try {
      await api.deleteSite(site.documentId);
      toggleNotification({ type: "success", message: `Đã xoá "${site.name}".` });
      await load();
    } catch (err) {
      // The server refuses while content or assignments still point at the site —
      // surface its reason verbatim, it says exactly what is blocking.
      toggleNotification({ type: "danger", message: errorMessage(err, "Không xoá được website.") });
    }
  };

  if (loading) return <Page.Loading />;

  return (
    <Layouts.Root>
      <Layouts.Header
        title="Websites (Tenants)"
        subtitle="Chỉ Super Admin. Mỗi website là một phạm vi nội dung và phân quyền riêng."
        primaryAction={<Button onClick={() => setDraft({ ...EMPTY })}>Thêm website</Button>}
      />
      <Layouts.Content>
        <Table colCount={6} rowCount={sites.length}>
          <Thead>
            <Tr>
              <Th>
                <Typography variant="sigma">Tên</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">Key</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">Domains</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">Locale</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">Người dùng</Typography>
              </Th>
              <Th>
                <Typography variant="sigma">Thao tác</Typography>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {sites.map((site) => (
              <Tr key={site.documentId}>
                <Td>
                  <Typography textColor={site.isActive === false ? "neutral500" : "neutral800"}>
                    {site.name}
                    {site.isActive === false ? " (tắt)" : ""}
                  </Typography>
                </Td>
                <Td>
                  <Typography>{site.key}</Typography>
                </Td>
                <Td>
                  <Typography>{(site.domains ?? []).join(", ") || "—"}</Typography>
                </Td>
                <Td>
                  <Typography>{site.defaultLocale ?? "—"}</Typography>
                </Td>
                <Td>
                  <Typography>{site.userCount ?? 0}</Typography>
                </Td>
                <Td>
                  <Flex gap={2}>
                    <Button
                      size="S"
                      variant="tertiary"
                      onClick={() =>
                        setDraft({
                          documentId: site.documentId,
                          name: site.name,
                          key: site.key,
                          domains: (site.domains ?? []).join(", "),
                          defaultLocale: site.defaultLocale ?? "vi",
                          locales: (site.locales ?? []).join(", "),
                          isActive: site.isActive !== false,
                        })
                      }
                    >
                      Sửa
                    </Button>
                    <Button size="S" variant="danger-light" onClick={() => remove(site)}>
                      Xoá
                    </Button>
                  </Flex>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Layouts.Content>

      {draft ? (
        <Modal.Root open onOpenChange={(open: boolean) => !open && setDraft(null)}>
          <Modal.Content>
            <Modal.Header>
              <Modal.Title>{draft.documentId ? "Sửa website" : "Thêm website"}</Modal.Title>
            </Modal.Header>
            <Modal.Body>
              <Flex direction="column" alignItems="stretch" gap={4}>
                <Field.Root name="name" required>
                  <Field.Label>Tên</Field.Label>
                  <Field.Input
                    value={draft.name}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraft({ ...draft, name: e.target.value })
                    }
                  />
                </Field.Root>
                <Field.Root name="key">
                  <Field.Label>Key</Field.Label>
                  <Field.Hint>
                    Định danh ổn định dùng cho cache tag. Để trống sẽ tự sinh từ tên.
                  </Field.Hint>
                  <Field.Input
                    value={draft.key}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraft({ ...draft, key: e.target.value })
                    }
                  />
                </Field.Root>
                <Field.Root name="domains">
                  <Field.Label>Domains</Field.Label>
                  <Field.Hint>Ngăn cách bằng dấu phẩy.</Field.Hint>
                  <Field.Input
                    value={draft.domains}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setDraft({ ...draft, domains: e.target.value })
                    }
                  />
                </Field.Root>
                <Flex gap={4} alignItems="flex-start">
                  <Field.Root name="defaultLocale">
                    <Field.Label>Locale mặc định</Field.Label>
                    <Field.Input
                      value={draft.defaultLocale}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setDraft({ ...draft, defaultLocale: e.target.value })
                      }
                    />
                  </Field.Root>
                  <Field.Root name="locales">
                    <Field.Label>Locales</Field.Label>
                    <Field.Input
                      value={draft.locales}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                        setDraft({ ...draft, locales: e.target.value })
                      }
                    />
                  </Field.Root>
                </Flex>
                <Field.Root name="isActive">
                  <Field.Label>Đang hoạt động</Field.Label>
                  <Toggle
                    checked={draft.isActive}
                    onLabel="Bật"
                    offLabel="Tắt"
                    onChange={() => setDraft({ ...draft, isActive: !draft.isActive })}
                  />
                </Field.Root>
              </Flex>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onClick={() => setDraft(null)}>
                Huỷ
              </Button>
              <Button onClick={save}>Lưu</Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      ) : null}
      <Box paddingTop={4} />
    </Layouts.Root>
  );
};

export { SitesPage };
