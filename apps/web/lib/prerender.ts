import "server-only";
import { connection } from "next/server";

/**
 * True for low-level "CMS is unreachable" fetch failures — as opposed to a
 * real 404, which the typed client already models as `StrapiNotFoundError`.
 * undici surfaces these as `TypeError: fetch failed` with a `cause.code`.
 */
export function isCmsUnavailable(err: unknown): boolean {
  const code = (err as { cause?: { code?: string } })?.cause?.code;
  if (
    code === "ECONNREFUSED" ||
    code === "ENOTFOUND" ||
    code === "ECONNRESET" ||
    code === "EAI_AGAIN" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "UND_ERR_SOCKET"
  ) {
    return true;
  }
  return err instanceof Error && err.message === "fetch failed";
}

/**
 * Load CMS data during render, but stay resilient to the CMS being unreachable
 * *at build time* (§5.1 static-shell pages prerender against a live CMS).
 *
 * If the fetch fails because the CMS is down, we `await connection()` to opt the
 * render out of prerendering — Next then generates the page at request time
 * (ISR) instead of hard-failing the build. Once the CMS is reachable the fetch
 * succeeds and the page prerenders as normal. A genuine error (bad data, 5xx,
 * bug) still propagates and fails loudly.
 *
 * This keeps the "content vs code" split intact: a CMS that happens to be down
 * when the *code* is built no longer blocks the deploy; the page just fills in
 * on first request.
 */
export async function loadResilient<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch (err) {
    if (isCmsUnavailable(err)) {
      // Bail out of prerendering; re-run at request time when the CMS is up.
      await connection();
      return await load();
    }
    throw err;
  }
}
