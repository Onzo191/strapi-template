import {
  Badge,
  Box,
  Button,
  Flex,
  SingleSelect,
  SingleSelectOption,
  Typography,
} from "@strapi/design-system";
import { Layouts, Page, useNotification } from "@strapi/strapi/admin";
import { useCallback, useEffect, useState } from "react";
import { type BoardItem, STATUS_COLUMNS, useEditorialApi, WORKFLOW_TYPES } from "../utils/api";

const STATUS_TONE: Record<string, "neutral" | "warning" | "secondary" | "success" | "danger"> = {
  draft: "neutral",
  review: "warning",
  approved: "secondary",
  published: "success",
  archived: "danger",
};

/** Which target statuses are offered from a given status (mirrors the state machine). */
const NEXT_STATUSES: Record<string, string[]> = {
  draft: ["review", "archived"],
  review: ["approved", "draft", "archived"],
  approved: ["published", "draft", "archived"],
  published: ["archived", "draft"],
  archived: ["draft"],
};

const WorkflowPage = () => {
  const api = useEditorialApi();
  const { toggleNotification } = useNotification();
  const [uid, setUid] = useState(WORKFLOW_TYPES[0].uid);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await api.board(uid));
    } catch {
      toggleNotification({ type: "warning", message: "Failed to load workflow board." });
    } finally {
      setLoading(false);
    }
  }, [uid, api, toggleNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const move = async (item: BoardItem, to: string) => {
    try {
      await api.transition({ uid, documentId: item.documentId, locale: item.locale, to });
      toggleNotification({ type: "success", message: `Moved "${item.title}" to ${to}.` });
      load();
    } catch (err) {
      const message =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? "Transition not allowed.";
      toggleNotification({ type: "danger", message });
    }
  };

  return (
    <Page.Main>
      <Layouts.Header
        title="Workflow board"
        subtitle="Drive content through the editorial workflow (§4.5)."
        primaryAction={
          <Box minWidth="16rem">
            <SingleSelect aria-label="Content type" value={uid} onChange={(v) => setUid(String(v))}>
              {WORKFLOW_TYPES.map((t) => (
                <SingleSelectOption key={t.uid} value={t.uid}>
                  {t.label}
                </SingleSelectOption>
              ))}
            </SingleSelect>
          </Box>
        }
      />
      <Layouts.Content>
        {loading ? (
          <Typography>Loading…</Typography>
        ) : (
          <Flex alignItems="flex-start" gap={4} style={{ overflowX: "auto" }}>
            {STATUS_COLUMNS.map((status) => {
              const columnItems = items.filter((i) => i.contentStatus === status);
              return (
                <Box
                  key={status}
                  padding={3}
                  background="neutral100"
                  hasRadius
                  minWidth="16rem"
                  width="16rem"
                >
                  <Flex justifyContent="space-between" marginBottom={3}>
                    <Badge>{status}</Badge>
                    <Typography variant="pi" textColor="neutral600">
                      {columnItems.length}
                    </Typography>
                  </Flex>
                  <Flex direction="column" alignItems="stretch" gap={2}>
                    {columnItems.map((item) => (
                      <Box
                        key={item.documentId}
                        padding={3}
                        background="neutral0"
                        hasRadius
                        shadow="tableShadow"
                      >
                        <Typography variant="omega" fontWeight="bold">
                          {item.title}
                        </Typography>
                        <Box marginTop={2}>
                          <Flex direction="column" alignItems="stretch" gap={1}>
                            {(NEXT_STATUSES[status] ?? []).map((to) => (
                              <Button
                                key={to}
                                variant={STATUS_TONE[to] === "danger" ? "danger-light" : "tertiary"}
                                size="S"
                                onClick={() => move(item, to)}
                              >
                                → {to}
                              </Button>
                            ))}
                          </Flex>
                        </Box>
                      </Box>
                    ))}
                    {columnItems.length === 0 && (
                      <Typography variant="pi" textColor="neutral500">
                        Empty
                      </Typography>
                    )}
                  </Flex>
                </Box>
              );
            })}
          </Flex>
        )}
      </Layouts.Content>
    </Page.Main>
  );
};

export { WorkflowPage };
