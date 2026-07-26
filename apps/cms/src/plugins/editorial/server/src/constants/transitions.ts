/**
 * Editorial state machine (§4.5). `contentStatus` is the editorial overlay on
 * top of Strapi's native Draft & Publish: it records *where in the workflow* a
 * document is, independent of whether the published version happens to exist.
 *
 * Only the transitions listed here are legal; every mutation goes through the
 * transition service, which rejects anything not in this table (400) and then
 * checks RBAC (403).
 */

export const CONTENT_STATUSES = ["draft", "review", "approved", "published", "archived"] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/** A named, legal state change. `action` is what RBAC is keyed on (see rbac.ts). */
export interface TransitionDef {
  from: ContentStatus;
  to: ContentStatus;
  action: string;
}

export const LEGAL_TRANSITIONS: TransitionDef[] = [
  // Linear approval flow.
  { from: "draft", to: "review", action: "submit" },
  { from: "review", to: "approved", action: "approve" },
  { from: "review", to: "draft", action: "reject" },
  { from: "approved", to: "published", action: "publish" },
  { from: "approved", to: "draft", action: "reject" },
  { from: "published", to: "draft", action: "unpublish" },
  // Trash (soft-delete) — reachable from any live state — and restore.
  { from: "draft", to: "archived", action: "archive" },
  { from: "review", to: "archived", action: "archive" },
  { from: "approved", to: "archived", action: "archive" },
  { from: "published", to: "archived", action: "archive" },
  { from: "archived", to: "draft", action: "restore" },
];

/** The transition definition for a `from → to` pair, or `undefined` if illegal. */
export function findTransition(from: ContentStatus, to: ContentStatus): TransitionDef | undefined {
  return LEGAL_TRANSITIONS.find((t) => t.from === from && t.to === to);
}

export function isContentStatus(value: unknown): value is ContentStatus {
  return typeof value === "string" && (CONTENT_STATUSES as readonly string[]).includes(value);
}

/** Content types this workflow governs (mirrors the D&P collection types). */
export const WORKFLOW_UIDS = [
  "api::article.article",
  "api::landing-page.landing-page",
  "api::page.page",
] as const;

export type WorkflowUid = (typeof WORKFLOW_UIDS)[number];

export function isWorkflowUid(uid: string): uid is WorkflowUid {
  return (WORKFLOW_UIDS as readonly string[]).includes(uid);
}
