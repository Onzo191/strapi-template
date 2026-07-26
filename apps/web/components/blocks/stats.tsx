import type { StatsBlock } from "@vng/shared";

export function Stats(block: StatsBlock) {
  return (
    <section className="vng-section vng-section--muted">
      <div className="vng-container">
        {block.heading && <h2 style={{ textAlign: "center" }}>{block.heading}</h2>}
        <div
          className="vng-grid"
          style={{
            gridTemplateColumns: `repeat(${Math.min(block.stats.length, 4)}, minmax(0, 1fr))`,
            textAlign: "center",
          }}
        >
          {block.stats.map((stat) => (
            <div key={stat.id}>
              <p style={{ fontSize: "2.5rem", fontWeight: 700, margin: 0 }}>
                {stat.prefix}
                {stat.value}
                {stat.suffix}
              </p>
              <p style={{ opacity: 0.75, margin: "0.25rem 0 0" }}>{stat.label}</p>
              {stat.description && (
                <p style={{ opacity: 0.6, fontSize: "0.85rem" }}>{stat.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
