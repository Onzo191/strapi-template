/**
 * Renders one or more JSON-LD nodes as `application/ld+json` (§6.3). `<` is
 * escaped to `<` so CMS-authored strings can't break out of the script
 * tag (`</script>` injection). `undefined` fields are dropped by JSON.stringify.
 */
export function JsonLd({ data }: { data: object | object[] }) {
  const nodes = Array.isArray(data) ? data : [data];
  return (
    <>
      {nodes.map((node) => {
        const json = JSON.stringify(node).replace(/</g, "\\u003c");
        const type = (node as { "@type"?: string })["@type"] ?? "ld";
        return (
          <script
            key={type}
            type="application/ld+json"
            // biome-ignore lint/security/noDangerouslySetInnerHtml: escaped JSON-LD built from validated CMS data, not raw HTML
            dangerouslySetInnerHTML={{ __html: json }}
          />
        );
      })}
    </>
  );
}
