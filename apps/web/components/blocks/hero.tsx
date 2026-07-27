import { cn } from "@vng/design-system";
import type { HeroBlock } from "@vng/shared";
import Image from "next/image";
import { ActionLink } from "@/components/ui/action-link";
import { resolveMediaUrl } from "@/lib/media";
import { SECTION_BACKGROUND } from "./section-background";

export function Hero(block: HeroBlock) {
  const centered = block.alignment === "center";

  return (
    <section className={cn("py-16 md:py-24", SECTION_BACKGROUND[block.background])}>
      <div
        className={cn(
          "mx-auto max-w-6xl px-6",
          centered && "flex flex-col items-center text-center",
        )}
      >
        {block.eyebrow && (
          <p className="text-sm font-semibold uppercase tracking-wide opacity-70">
            {block.eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-display font-bold text-balance">{block.heading}</h1>
        {block.subheading && (
          <p className={cn("mt-4 max-w-2xl text-lg opacity-85", centered && "mx-auto")}>
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
            sizes="(max-width: 768px) 100vw, 1152px"
            className="mt-10 w-full rounded-xl"
          />
        )}
        {block.actions && block.actions.length > 0 && (
          <div className={cn("mt-8 flex flex-wrap gap-4", centered && "justify-center")}>
            {block.actions.map((action) => (
              <ActionLink key={action.id} action={action} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
