import type { Block, BlockComponent } from "@vng/shared";
import { zBlock } from "@vng/shared";
import type { ComponentType } from "react";
import { ArticleCarousel } from "./article-carousel";
import { ContactForm } from "./contact-form";
import { Cta } from "./cta";
import { Embed } from "./embed";
import { Faq } from "./faq";
import { FeatureGrid } from "./feature-grid";
import { Hero } from "./hero";
import { ImageGallery } from "./image-gallery";
import { LeadershipGrid } from "./leadership-grid";
import { LogoCloud } from "./logo-cloud";
import { MediaBlockView } from "./media-block";
import { RichTextBlockView } from "./rich-text-block";
import { Stats } from "./stats";
import { Testimonial } from "./testimonial";
import { Timeline } from "./timeline";

/** blockType → React component (§4.2/§7). `ComponentType` covers async Server Components too
 * (`ArticleCarousel` fetches) — React's own types allow a function component to return
 * `Promise<ReactNode>`. Add a block here + its Zod schema to extend the library. */
type BlockRegistry = {
  [K in BlockComponent]: ComponentType<Extract<Block, { __component: K }>>;
};

const registry: BlockRegistry = {
  "blocks.hero": Hero,
  "blocks.rich-text": RichTextBlockView,
  "blocks.media": MediaBlockView,
  "blocks.image-gallery": ImageGallery,
  "blocks.cta": Cta,
  "blocks.feature-grid": FeatureGrid,
  "blocks.stats": Stats,
  "blocks.logo-cloud": LogoCloud,
  "blocks.timeline": Timeline,
  "blocks.leadership-grid": LeadershipGrid,
  "blocks.faq": Faq,
  "blocks.testimonial": Testimonial,
  "blocks.embed": Embed,
  "blocks.article-carousel": ArticleCarousel,
  "blocks.contact-form": ContactForm,
};

/** Renders a page-builder dynamic zone. Malformed entries are validated out, not crashed on. */
export function BlockRenderer({ blocks }: { blocks: unknown[] }) {
  return (
    <>
      {blocks.map((raw) => {
        const parsed = zBlock.safeParse(raw);
        if (!parsed.success) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("[block-registry] skipping invalid block", parsed.error.flatten());
          }
          return null;
        }

        const block = parsed.data;
        // Indexing by the runtime-narrowed discriminant can't be proven exhaustive by
        // TS at this call site — the per-key typing above is what keeps this honest.
        const Component = registry[block.__component] as ComponentType<typeof block>;
        // `block.id` is Strapi's own per-zone-entry component id — stable and unique
        // within this dynamic zone, so no array index is needed in the key.
        return <Component key={`${block.__component}-${block.id}`} {...block} />;
      })}
    </>
  );
}
