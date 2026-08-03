import { useFetchClient } from "@strapi/strapi/admin";
import { useMemo } from "react";
import { PLUGIN_ID } from "../pluginId";

export interface Site {
  documentId: string;
  name: string;
  key: string;
  domains?: string[];
  defaultLocale?: string;
  locales?: string[];
  theme?: string | null;
  isActive?: boolean;
  userCount?: number;
}

export interface MyContext {
  isSuperAdmin: boolean;
  activeSiteDocumentId: string | null;
  sites: Site[];
}

export interface AssignmentUser {
  id: number;
  email: string;
  name: string | null;
  isActive: boolean;
  isSuperAdmin: boolean;
  roles: string[];
  siteDocumentIds: string[];
}

/** Pull a server error message out of the admin fetch client's axios-shaped error. */
export function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
      ?.message ?? fallback
  );
}

/**
 * Thin wrapper over the admin fetch client for the tenant endpoints, mirroring
 * `plugins/editorial/admin/src/utils/api.ts`.
 *
 * Memoised on the fetch client: the hook is consumed inside `useCallback`
 * dependency lists, and a fresh object each render would re-fire every loader.
 */
export function useTenantApi() {
  const { get, post, put, del } = useFetchClient();

  return useMemo(
    () => ({
      async myContext(): Promise<MyContext> {
        const { data } = await get(`/${PLUGIN_ID}/me/sites`);
        return data.data;
      },

      async setActiveSite(siteDocumentId: string): Promise<void> {
        await post(`/${PLUGIN_ID}/me/active-site`, { siteDocumentId });
      },

      async sites(): Promise<Site[]> {
        const { data } = await get(`/${PLUGIN_ID}/sites`);
        return data.data ?? [];
      },

      async createSite(input: Partial<Site>): Promise<Site> {
        const { data } = await post(`/${PLUGIN_ID}/sites`, input);
        return data.data;
      },

      async updateSite(documentId: string, input: Partial<Site>): Promise<Site> {
        const { data } = await put(`/${PLUGIN_ID}/sites/${documentId}`, input);
        return data.data;
      },

      async deleteSite(documentId: string): Promise<void> {
        await del(`/${PLUGIN_ID}/sites/${documentId}`);
      },

      async assignments(): Promise<AssignmentUser[]> {
        const { data } = await get(`/${PLUGIN_ID}/assignments`);
        return data.data ?? [];
      },

      async setAssignments(userId: number, siteDocumentIds: string[]): Promise<void> {
        await put(`/${PLUGIN_ID}/assignments/${userId}`, { siteDocumentIds });
      },
    }),
    [get, post, put, del],
  );
}
