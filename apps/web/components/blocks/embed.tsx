import { cn } from "@vng/design-system";
import type { EmbedBlock } from "@vng/shared";

const ASPECT_CLASS: Record<EmbedBlock["aspectRatio"], string> = {
  "16:9": "aspect-video",
  "4:3": "aspect-4/3",
  "1:1": "aspect-square",
};

/**
 * External iframe embed (IR / BU / DMF, §0 A7 — those sites stay embedded/linked,
 * not re-platformed). Only `url` renders: `embedCode` is unsanitized editor-supplied
 * HTML and is intentionally never injected via `dangerouslySetInnerHTML`.
 */
export function Embed(block: EmbedBlock) {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {block.title && <h2 className="mb-4 text-2xl font-semibold">{block.title}</h2>}
        <div
          className={cn(
            "w-full overflow-hidden rounded-xl bg-muted",
            !block.height && ASPECT_CLASS[block.aspectRatio],
          )}
          style={block.height ? { height: block.height } : undefined}
        >
          {block.url && (
            <iframe
              src={block.url}
              title={block.title ?? "Embedded content"}
              loading="lazy"
              className="size-full border-0"
              allowFullScreen
            />
          )}
        </div>
      </div>
    </section>
  );
}
