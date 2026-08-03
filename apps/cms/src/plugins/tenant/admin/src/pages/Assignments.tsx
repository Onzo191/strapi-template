import {
  Badge,
  Box,
  Button,
  Checkbox,
  Flex,
  Searchbar,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from "@strapi/design-system";
import { Layouts, Page, useNotification } from "@strapi/strapi/admin";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type AssignmentUser, errorMessage, type Site, useTenantApi } from "../utils/api";

/**
 * Tenant console — who may work on which website. Super admin only.
 *
 * Edits are applied per row rather than as one big save: a matrix that submits
 * everything at once makes an accidental un-tick somewhere off-screen into a
 * silent revocation. Each row's "Lưu" says exactly whose access changed, and the
 * server writes a `tenant.grant` / `tenant.revoke` audit row for each change.
 */
const AssignmentsPage = () => {
  const api = useTenantApi();
  const { toggleNotification } = useNotification();
  const [users, setUsers] = useState<AssignmentUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [draft, setDraft] = useState<Record<number, string[]>>({});
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [nextUsers, nextSites] = await Promise.all([api.assignments(), api.sites()]);
      setUsers(nextUsers);
      setSites(nextSites);
      setDraft(Object.fromEntries(nextUsers.map((u) => [u.id, [...u.siteDocumentIds]])));
    } catch (err) {
      toggleNotification({
        type: "warning",
        message: errorMessage(err, "Không tải được phân quyền."),
      });
    } finally {
      setLoading(false);
    }
  }, [api, toggleNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return users;
    return users.filter(
      (user) =>
        user.email.toLowerCase().includes(needle) ||
        (user.name ?? "").toLowerCase().includes(needle),
    );
  }, [users, query]);

  const toggle = (userId: number, siteDocumentId: string) => {
    setDraft((prev) => {
      const current = prev[userId] ?? [];
      return {
        ...prev,
        [userId]: current.includes(siteDocumentId)
          ? current.filter((id) => id !== siteDocumentId)
          : [...current, siteDocumentId],
      };
    });
  };

  const isDirty = (user: AssignmentUser): boolean => {
    const next = [...(draft[user.id] ?? [])].sort();
    const current = [...user.siteDocumentIds].sort();
    return next.length !== current.length || next.some((id, i) => id !== current[i]);
  };

  const save = async (user: AssignmentUser) => {
    try {
      await api.setAssignments(user.id, draft[user.id] ?? []);
      toggleNotification({ type: "success", message: `Đã cập nhật quyền của ${user.email}.` });
      await load();
    } catch (err) {
      toggleNotification({
        type: "danger",
        message: errorMessage(err, "Không lưu được phân quyền."),
      });
    }
  };

  if (loading) return <Page.Loading />;

  return (
    <Layouts.Root>
      <Layouts.Header
        title="Phân quyền website"
        subtitle="Chỉ Super Admin. Người dùng chỉ thấy và sửa được nội dung của website được tick."
      />
      <Layouts.Content>
        <Box paddingBottom={4}>
          <Searchbar
            name="search"
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            onClear={() => setQuery("")}
            placeholder="Tìm theo email hoặc tên"
          >
            Tìm người dùng
          </Searchbar>
        </Box>

        <Table colCount={sites.length + 2} rowCount={visible.length}>
          <Thead>
            <Tr>
              <Th>
                <Typography variant="sigma">Người dùng</Typography>
              </Th>
              {sites.map((site) => (
                <Th key={site.documentId}>
                  <Typography variant="sigma">{site.name}</Typography>
                </Th>
              ))}
              <Th>
                <Typography variant="sigma">Lưu</Typography>
              </Th>
            </Tr>
          </Thead>
          <Tbody>
            {visible.map((user) => (
              <Tr key={user.id}>
                <Td>
                  <Flex direction="column" alignItems="flex-start">
                    <Typography fontWeight="semiBold">{user.name ?? user.email}</Typography>
                    <Typography variant="pi" textColor="neutral600">
                      {user.email}
                      {user.roles.length > 0 ? ` · ${user.roles.join(", ")}` : ""}
                    </Typography>
                  </Flex>
                </Td>

                {user.isSuperAdmin ? (
                  <Td colSpan={sites.length}>
                    <Badge>Super Admin — truy cập mọi website</Badge>
                  </Td>
                ) : (
                  sites.map((site) => (
                    <Td key={site.documentId}>
                      <Checkbox
                        aria-label={`${user.email} — ${site.name}`}
                        checked={(draft[user.id] ?? []).includes(site.documentId)}
                        onCheckedChange={() => toggle(user.id, site.documentId)}
                      />
                    </Td>
                  ))
                )}

                <Td>
                  {user.isSuperAdmin ? null : (
                    <Button size="S" disabled={!isDirty(user)} onClick={() => save(user)}>
                      Lưu
                    </Button>
                  )}
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
      </Layouts.Content>
    </Layouts.Root>
  );
};

export { AssignmentsPage };
