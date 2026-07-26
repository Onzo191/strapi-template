import type { HeroBlock } from "@vng/shared";
import Image from "next/image";
import { ActionLink } from "@/components/ui/action-link";
import { resolveMediaUrl } from "@/lib/media";

export function Hero(block: HeroBlock) {
  return (
    <section className={`vng-section vng-section--${block.background}`}>
      <div
        className="vng-container"
        style={{ textAlign: block.alignment === "center" ? "center" : "left" }}
      >
        {block.eyebrow && <p className="vng-eyebrow">{block.eyebrow}</p>}
        <h1 style={{ fontSize: "clamp(2rem, 4vw, 3.5rem)", margin: "0.5rem 0" }}>
          {block.heading}
        </h1>
        {block.subheading && (
          <p style={{ fontSize: "1.15rem", opacity: 0.85, maxWidth: "42rem" }}>
            {block.subheading}
          </p>
        )}
        {block.media && (
          <Image
            src={resolveMediaUrl(block.media.url)}
            alt={block.media.alternativeText ?? block.heading}
            width={block.media.width ?? 1200}
            height={block.media.height ?? 675}
            priority
            style={{ width: "100%", height: "auto", marginTop: "2rem" }}
          />
        )}
        {block.actions && block.actions.length > 0 && (
          <div style={{ display: "flex", gap: "1rem", marginTop: "2rem", flexWrap: "wrap" }}>
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
