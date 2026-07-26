import {
  Badge,
  Box,
  Button,
  Flex,
  Table,
  Tbody,
  Td,
  TextInput,
  Th,
  Thead,
  Tr,
  Typography,
} from "@strapi/design-system";
import { Layouts, Page, useFetchClient, useNotification } from "@strapi/strapi/admin";
import { useCallback, useEffect, useState } from "react";
import { type AuditRow, useEditorialApi } from "../utils/api";

const PAGE_SIZE = 25;

const AuditLogPage = () => {
  const api = useEditorialApi();
  const { get } = useFetchClient();
  const { toggleNotification } = useNotification();

  const [rows, setRows] = useState<AuditRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [filters, setFilters] = useState({ action: "", contentType: "", actorEmail: "" });

  const activeParams = useCallback(
    (extra: Record<string, string> = {}) => {
      const params: Record<string, string> = { ...extra };
      for (const [key, value] of Object.entries(filters)) {
        if (value) params[key] = value;
      }
      return params;
    },
    [filters],
  );

  const load = useCallback(async () => {
    try {
      const res = await api.audit(
        activeParams({ page: String(page), pageSize: String(PAGE_SIZE) }),
      );
      setRows(res.results);
      setPageCount(res.pagination.pageCount || 1);
    } catch {
      toggleNotification({ type: "warning", message: "Failed to load audit log." });
    }
  }, [api, activeParams, page, toggleNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const download = async (format: "csv" | "json") => {
    try {
      const url = api.exportUrl(activeParams({ format }));
      const res = await get(url, { responseType: "text" });
      const blob = new Blob([res.data], {
        type: format === "csv" ? "text/csv" : "application/json",
      });
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = `audit-log.${format}`;
      a.click();
      URL.revokeObjectURL(href);
    } catch {
      toggleNotification({ type: "danger", message: "Export failed." });
    }
  };

  return (
    <Page.Main>
      <Layouts.Header
        title="Audit log"
        subtitle="Immutable record of every content action (§4.5 / Req §5)."
        primaryAction={
          <Flex gap={2}>
            <Button variant="secondary" onClick={() => download("csv")}>
              Export CSV
            </Button>
            <Button variant="secondary" onClick={() => download("json")}>
              Export JSON
            </Button>
          </Flex>
        }
      />
      <Layouts.Content>
        <Flex gap={2} marginBottom={4} alignItems="flex-end">
          <TextInput
            label="Action"
            value={filters.action}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFilters((f) => ({ ...f, action: e.target.value }))
            }
          />
          <TextInput
            label="Content type"
            value={filters.contentType}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFilters((f) => ({ ...f, contentType: e.target.value }))
            }
          />
          <TextInput
            label="Actor email"
            value={filters.actorEmail}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFilters((f) => ({ ...f, actorEmail: e.target.value }))
            }
          />
          <Button
            onClick={() => {
              setPage(1);
              load();
            }}
          >
            Filter
          </Button>
        </Flex>

        <Box background="neutral0" hasRadius shadow="tableShadow">
          <Table colCount={7} rowCount={rows.length}>
            <Thead>
              <Tr>
                <Th>
                  <Typography variant="sigma">Time</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Action</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Type</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Entry</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Change</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Actor</Typography>
                </Th>
                <Th>
                  <Typography variant="sigma">Reason</Typography>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <Typography variant="pi">{new Date(row.timestamp).toLocaleString()}</Typography>
                  </Td>
                  <Td>
                    <Badge>{row.action}</Badge>
                  </Td>
                  <Td>
                    <Typography variant="pi">{(row.contentType ?? "").split(".").pop()}</Typography>
                  </Td>
                  <Td>
                    <Typography variant="pi">{row.entryTitle ?? row.documentId ?? "—"}</Typography>
                  </Td>
                  <Td>
                    <Typography variant="pi">
                      {row.fromStatus ? `${row.fromStatus} → ${row.toStatus}` : "—"}
                    </Typography>
                  </Td>
                  <Td>
                    <Typography variant="pi">{row.actorEmail ?? "system"}</Typography>
                  </Td>
                  <Td>
                    <Typography variant="pi">{row.reason ?? ""}</Typography>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </Box>

        <Flex justifyContent="space-between" marginTop={3}>
          <Button
            variant="tertiary"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <Typography variant="pi">
            Page {page} / {pageCount}
          </Typography>
          <Button
            variant="tertiary"
            disabled={page >= pageCount}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </Flex>
      </Layouts.Content>
    </Page.Main>
  );
};

export { AuditLogPage };
