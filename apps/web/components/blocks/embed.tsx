import type { EmbedBlock } from "@vng/shared";

const ASPECT_RATIO: Record<EmbedBlock["aspectRatio"], string> = {
  "16:9": "16 / 9",
  "4:3": "4 / 3",
  "1:1": "1 / 1",
};

/**
 * External iframe embed (IR / BU / DMF, §0 A7 — those sites stay embedded/linked,
 * not re-platformed). Only `url` renders: `embedCode` is unsanitized editor-supplied
 * HTML and is intentionally never injected via `dangerouslySetInnerHTML`.
 */
export function Embed(block: EmbedBlock) {
  const wrapperStyle = block.height
    ? { height: `${block.height}px` }
    : { aspectRatio: ASPECT_RATIO[block.aspectRatio] };

  return (
    <section className="vng-section">
      <div className="vng-container">
        {block.title && <h2>{block.title}</h2>}
        <div
          style={{ ...wrapperStyle, width: "100%", overflow: "hidden", borderRadius: "0.75rem" }}
        >
          {block.url && (
            <iframe
              src={block.url}
              title={block.title ?? "Embedded content"}
              loading="lazy"
              style={{ width: "100%", height: "100%", border: 0 }}
              allowFullScreen
            />
          )}
        </div>
      </div>
    </section>
  );
}
