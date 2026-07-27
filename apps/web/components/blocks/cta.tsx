import { cn } from "@vng/design-system";
import type { CtaBlock } from "@vng/shared";
import { ActionLink } from "@/components/ui/action-link";
import { SECTION_BACKGROUND } from "./section-background";

export function Cta(block: CtaBlock) {
  return (
    <section className={cn("py-16 md:py-24", SECTION_BACKGROUND[block.background])}>
      <div className="mx-auto max-w-2xl px-6 text-center">
        <h2 className="text-display-sm font-bold text-balance">{block.heading}</h2>
        {block.description && <p className="mt-3 opacity-85">{block.description}</p>}
        {block.actions && block.actions.length > 0 && (
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
