/**
 * Async-local flag to suppress the generic auto-audit middleware while an
 * explicit editorial transition runs. Without it, a transition's internal
 * `documents.update` / `publish` would emit a noisy `update`/`publish` audit
 * row on top of the precise `approve`/`publish` transition row. The transition
 * service wraps its mutations in `runWithoutAutoAudit`, so exactly one audit
 * entry per logical action is recorded.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<{ suppress: boolean }>();

export function runWithoutAutoAudit<T>(fn: () => Promise<T>): Promise<T> {
  return storage.run({ suppress: true }, fn);
}

export function isAutoAuditSuppressed(): boolean {
  return storage.getStore()?.suppress === true;
}
