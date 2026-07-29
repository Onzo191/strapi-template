import type { FaqBlock } from "@vng/shared";
import { ChevronDown } from "lucide-react";
import { JsonLd } from "@/components/seo/json-ld";

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
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-2xl px-6">
        {block.heading && (
          <h2 className="mb-6 text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        <div className="flex flex-col gap-3">
          {block.items.map((item) => (
            <details
              key={item.id}
              className="group rounded-xl border border-border bg-card px-5 py-4"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {item.question}
                <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-3 text-muted-foreground">{item.answer}</p>
            </details>
          ))}
        </div>
        {/*
          Emitted through `JsonLd`, not a local `dangerouslySetInnerHTML`: the
          question/answer strings are editor-authored, so an answer containing
          `</script><script>…` would otherwise break out of the JSON-LD block and
          execute. `JsonLd` escapes `<` to `<`, which JSON parsers accept and
          the HTML tokenizer cannot see as a tag.
        */}
        <JsonLd data={jsonLd} />
      </div>
    </section>
  );
}
