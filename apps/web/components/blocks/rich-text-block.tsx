import type { RichTextBlock } from "@vng/shared";
import { RichText } from "@/components/rich-text";

const MAX_WIDTH: Record<RichTextBlock["width"], string> = {
  narrow: "36rem",
  default: "48rem",
  wide: "64rem",
};

export function RichTextBlockView(block: RichTextBlock) {
  return (
    <section className="vng-section">
      <div className="vng-container" style={{ maxWidth: MAX_WIDTH[block.width] }}>
        <RichText content={block.content} />
      </div>
    </section>
  );
}
