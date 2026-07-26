import type { FaqBlock } from "@vng/shared";

/** Renders as native `<details>` (no client JS needed) + FAQPage JSON-LD (§6.3). */
export function Faq(block: FaqBlock) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: block.items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };

  return (
    <section className="vng-section">
      <div className="vng-container" style={{ maxWidth: "42rem" }}>
        {block.heading && <h2>{block.heading}</h2>}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {block.items.map((item) => (
            <details key={item.id} className="vng-card" style={{ padding: "1rem 1.25rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>{item.question}</summary>
              <p style={{ opacity: 0.8, marginBottom: 0 }}>{item.answer}</p>
            </details>
          ))}
        </div>
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: fixed JSON-LD payload built from validated block data, not user HTML
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </div>
    </section>
  );
}
