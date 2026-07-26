import "server-only";

/** Absolute-ize a Strapi media URL (local upload provider returns relative paths). */
export function resolveMediaUrl(url: string): string {
  if (/^https?:\/\//.test(url)) return url;
  const base = process.env.STRAPI_URL ?? "http://localhost:1337";
  return `${base}${url}`;
}
