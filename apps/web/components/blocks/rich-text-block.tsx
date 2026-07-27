import type { RichTextBlock } from "@vng/shared";
import { RichText } from "@/components/rich-text";

const MAX_WIDTH: Record<RichTextBlock["width"], string> = {
  narrow: "max-w-xl",
  default: "max-w-3xl",
  wide: "max-w-5xl",
};

export function RichTextBlockView(block: RichTextBlock) {
  return (
    <section className="py-16 md:py-24">
      <div className={`mx-auto px-6 ${MAX_WIDTH[block.width]}`}>
        <RichText content={block.content} />
      </div>
    </section>
  );
}
