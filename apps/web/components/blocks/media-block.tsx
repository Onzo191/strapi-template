import type { MediaBlock } from "@vng/shared";
import Image from "next/image";
import { resolveMediaUrl } from "@/lib/media";

const MAX_WIDTH: Record<MediaBlock["width"], string> = {
  narrow: "36rem",
  default: "48rem",
  wide: "64rem",
  full: "100%",
};

export function MediaBlockView(block: MediaBlock) {
  const isVideo = block.file.mime.startsWith("video");

  return (
    <section className="vng-section">
      <div className="vng-container" style={{ maxWidth: MAX_WIDTH[block.width] }}>
        {isVideo ? (
          // biome-ignore lint/a11y/useMediaCaption: editor-supplied media, no CMS-managed captions track
          <video
            src={resolveMediaUrl(block.file.url)}
            controls
            style={{ width: "100%", height: "auto" }}
          />
        ) : (
          <Image
            src={resolveMediaUrl(block.file.url)}
            alt={block.alt ?? block.caption ?? ""}
            width={block.file.width ?? 1200}
            height={block.file.height ?? 675}
            style={{ width: "100%", height: "auto" }}
          />
        )}
        {block.caption && (
          <p style={{ opacity: 0.7, fontSize: "0.9rem", marginTop: "0.5rem" }}>{block.caption}</p>
        )}
      </div>
    </section>
  );
}
