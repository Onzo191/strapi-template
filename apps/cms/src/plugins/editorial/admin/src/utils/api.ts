import { useFetchClient } from "@strapi/strapi/admin";

/** Content types the workflow board can display. */
export const WORKFLOW_TYPES = [
  { uid: "api::article.article", label: "Articles" },
  { uid: "api::landing-page.landing-page", label: "Landing Pages" },
  { uid: "api::page.page", label: "Pages" },
];

export const STATUS_COLUMNS = ["draft", "review", "approved", "published", "archived"] as const;

export interface BoardItem {
  documentId: string;
  title: string;
  slug: string;
  contentStatus: string;
  trashedAt: string | null;
  locale: string | null;
  updatedAt: string;
}

export interface AuditRow {
  id: number;
  timestamp: string;
  action: string;
  contentType: string | null;
  documentId: string | null;
  locale: string | null;
  entryTitle: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  actorEmail: string | null;
  actorName: string | null;
  reason: string | null;
}

/** Thin wrapper over the admin fetch client for the plugin's endpoints. */
export function useEditorialApi() {
  const { get, post } = useFetchClient();

  return {
    async board(uid: string, locale?: string): Promise<BoardItem[]> {
      const query = new URLSearchParams({ uid, ...(locale ? { locale } : {}) });
      const { data } = await get(`/editorial/workflow?${query.toString()}`);
      return data.data ?? [];
    },

    async transition(input: {
      uid: string;
      documentId: string;
      locale?: string | null;
      to: string;
      reason?: string;
    }) {
      const { data } = await post("/editorial/transition", input);
      return data.data;
    },

    async audit(params: Record<string, string>): Promise<{
      results: AuditRow[];
      pagination: { page: number; pageSize: number; total: number; pageCount: number };
    }> {
      const query = new URLSearchParams(params);
      const { data } = await get(`/editorial/audit?${query.toString()}`);
      return data;
    },

    exportUrl(params: Record<string, string>): string {
      const query = new URLSearchParams(params);
      return `/editorial/audit/export?${query.toString()}`;
    },
  };
}
