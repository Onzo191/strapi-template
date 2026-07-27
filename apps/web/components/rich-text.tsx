import { type BlocksContent, BlocksRenderer } from "@strapi/blocks-react-renderer";
import { resolveMediaUrl } from "@/lib/media";

interface ImageNode {
  type: "image";
  image: { url: string } & Record<string, unknown>;
}

function isImageNode(node: unknown): node is ImageNode {
  return (
    typeof node === "object" &&
    node !== null &&
    (node as { type?: unknown }).type === "image" &&
    typeof (node as { image?: { url?: unknown } }).image?.url === "string"
  );
}

/** Absolute-ize embedded image URLs server-side before handing data to the (client) renderer. */
function resolveImageUrls(nodes: unknown[]): BlocksContent {
  return nodes.map((node) =>
    isImageNode(node)
      ? { ...node, image: { ...node.image, url: resolveMediaUrl(node.image.url) } }
      : node,
  ) as BlocksContent;
}

const PROSE_CLASSES =
  "max-w-2xl text-base leading-7 text-foreground " +
  "[&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-semibold " +
  "[&_h3]:mb-2 [&_h3]:mt-8 [&_h3]:text-xl [&_h3]:font-semibold " +
  "[&_p]:mb-4 [&_ul]:mb-4 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-4 [&_ol]:list-decimal [&_ol]:pl-6 " +
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4 " +
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground " +
  "[&_img]:my-6 [&_img]:rounded-lg " +
  "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:text-sm";

/** Renders a Strapi `blocks`-editor field (article body, rich-text block content). */
export function RichText({ content }: { content: unknown[] }) {
  if (!content || content.length === 0) return null;
  return (
    <div className={PROSE_CLASSES}>
      <BlocksRenderer content={resolveImageUrls(content)} />
    </div>
  );
}
