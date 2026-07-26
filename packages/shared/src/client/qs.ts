/**
 * Minimal bracket-notation query serializer for the Strapi REST API
 * (`populate[cover]=true`, `filters[slug][$eq]=foo`, `pagination[page]=1`).
 * Strapi parses query strings with `qs` server-side; this covers the same
 * bracket notation without pulling in the `qs` dependency for such a small
 * surface.
 */

function appendParam(pairs: string[], key: string, value: unknown): void {
  if (value === undefined || value === null) return;

  if (Array.isArray(value)) {
    for (const [index, item] of value.entries()) {
      appendParam(pairs, `${key}[${index}]`, item);
    }
    return;
  }

  if (typeof value === "object") {
    for (const [nestedKey, nestedValue] of Object.entries(value as Record<string, unknown>)) {
      appendParam(pairs, `${key}[${nestedKey}]`, nestedValue);
    }
    return;
  }

  pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
}

/** Serialize a nested params object into a Strapi-compatible query string (no leading `?`). */
export function toQueryString(params: Record<string, unknown>): string {
  const pairs: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    appendParam(pairs, key, value);
  }
  return pairs.join("&");
}
