import { Card, CardContent, CardDescription, CardTitle } from "@vng/design-system";
import type { FeatureGridBlock } from "@vng/shared";
import { SmartLink } from "@/components/ui/smart-link";

export function FeatureGrid(block: FeatureGridBlock) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {block.heading && (
          <h2 className="text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        {block.description && (
          <p className="mt-3 max-w-2xl text-muted-foreground">{block.description}</p>
        )}
        <div
          className="mt-10 grid gap-6"
          // `columns` is CMS-driven at runtime, so Tailwind can't statically generate a
          // `grid-cols-N` class for it — this is a genuine dynamic value, not a shortcut.
          style={{ gridTemplateColumns: `repeat(${block.columns}, minmax(0, 1fr))` }}
        >
          {block.features.map((feature) => (
            <Card key={feature.id}>
              <CardContent className="flex flex-col gap-2 pt-6">
                <CardTitle>{feature.title}</CardTitle>
                {feature.description && <CardDescription>{feature.description}</CardDescription>}
                {feature.link && (
                  <SmartLink
                    href={feature.link.href}
                    target={feature.link.target}
                    className="mt-2 text-sm font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    {feature.link.label}
                  </SmartLink>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
