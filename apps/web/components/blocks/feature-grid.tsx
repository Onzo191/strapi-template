import type { FeatureGridBlock } from "@vng/shared";
import { SmartLink } from "@/components/ui/smart-link";

export function FeatureGrid(block: FeatureGridBlock) {
  return (
    <section className="vng-section">
      <div className="vng-container">
        {block.heading && <h2>{block.heading}</h2>}
        {block.description && (
          <p style={{ opacity: 0.8, maxWidth: "42rem" }}>{block.description}</p>
        )}
        <div
          className="vng-grid"
          style={{
            gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))`,
            marginTop: "1.5rem",
          }}
        >
          {block.features.map((feature) => (
            <div key={feature.id} className="vng-card" style={{ padding: "1.5rem" }}>
              <h3 style={{ marginTop: 0 }}>{feature.title}</h3>
              {feature.description && <p style={{ opacity: 0.75 }}>{feature.description}</p>}
              {feature.link && (
                <SmartLink href={feature.link.href} target={feature.link.target}>
                  {feature.link.label}
                </SmartLink>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
