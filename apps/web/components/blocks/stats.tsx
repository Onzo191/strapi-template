import type { StatsBlock } from "@vng/shared";

export function Stats(block: StatsBlock) {
  return (
    <section className="bg-muted py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {block.heading && (
          <h2 className="text-center text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        <div
          className="mt-10 grid gap-8 text-center"
          style={{
            gridTemplateColumns: `repeat(${Math.min(block.stats.length, 4)}, minmax(0, 1fr))`,
          }}
        >
          {block.stats.map((stat) => (
            <div key={stat.id}>
              <p className="text-4xl font-bold md:text-5xl">
                {stat.prefix}
                {stat.value}
                {stat.suffix}
              </p>
              <p className="mt-1 font-medium text-muted-foreground">{stat.label}</p>
              {stat.description && (
                <p className="mt-1 text-sm text-muted-foreground/80">{stat.description}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
