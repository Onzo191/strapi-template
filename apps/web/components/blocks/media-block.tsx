import type { MediaBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

const MAX_WIDTH: Record<MediaBlock["width"], string> = {
  narrow: "max-w-xl",
  default: "max-w-3xl",
  wide: "max-w-5xl",
  full: "max-w-none",
};

export function MediaBlockView(block: MediaBlock) {
  const isVideo = block.file.mime.startsWith("video");

  return (
    <section className="py-16 md:py-24">
      <div className={`mx-auto px-6 ${MAX_WIDTH[block.width]}`}>
        {isVideo ? (
          // biome-ignore lint/a11y/useMediaCaption: editor-supplied media, no CMS-managed captions track
          <video src={resolveMediaUrl(block.file.url)} controls className="w-full rounded-xl" />
        ) : (
          <Image
            src={resolveMediaUrl(block.file.url)}
            alt={block.alt ?? block.caption ?? ""}
            width={block.file.width ?? 1200}
            height={block.file.height ?? 675}
            sizes="(max-width: 768px) 100vw, 960px"
            className="w-full rounded-xl"
          />
        )}
        {block.caption && <p className="mt-2 text-sm text-muted-foreground">{block.caption}</p>}
      </div>
    </section>
  );
}
