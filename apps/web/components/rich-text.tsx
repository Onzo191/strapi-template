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

/** Renders a Strapi `blocks`-editor field (article body, rich-text block content). */
export function RichText({ content }: { content: unknown[] }) {
  if (!content || content.length === 0) return null;
  return (
    <div className="vng-prose">
      <BlocksRenderer content={resolveImageUrls(content)} />
    </div>
  );
}
