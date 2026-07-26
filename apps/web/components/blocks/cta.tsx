import type { CtaBlock } from "@vng/shared";
import { ActionLink } from "@/components/ui/action-link";

export function Cta(block: CtaBlock) {
  return (
    <section className={`vng-section vng-section--${block.background}`}>
      <div className="vng-container" style={{ textAlign: "center" }}>
        <h2 style={{ fontSize: "2rem" }}>{block.heading}</h2>
        {block.description && (
          <p style={{ opacity: 0.85, maxWidth: "36rem", marginInline: "auto" }}>
            {block.description}
          </p>
        )}
        {block.actions && block.actions.length > 0 && (
          <div
            style={{
              display: "flex",
              gap: "1rem",
              justifyContent: "center",
              marginTop: "1.5rem",
              flexWrap: "wrap",
            }}
          >
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
