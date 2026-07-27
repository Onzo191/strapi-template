import { Reveal, Skeleton } from "@vng/design-system";
import type { Block, BlockComponent } from "@vng/shared";
import { zBlock } from "@vng/shared";
import type { ComponentType } from "react";
import { Suspense } from "react";
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

const SKELETON_KEYS = ["a", "b", "c"] as const;

function ArticleGridSkeleton() {
  return (
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Skeleton className="mb-8 h-9 w-64" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6">
          {SKELETON_KEYS.map((key) => (
            <Skeleton key={key} className="h-64" />
          ))}
        </div>
      </div>
    </section>
  );
}

/** Renders a page-builder dynamic zone. Malformed entries are validated out, not crashed on. */
export function BlockRenderer({ blocks }: { blocks: unknown[] }) {
  return (
    <>
      {blocks.map((raw, index) => {
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
        // The auto-pull carousel does its own Strapi fetch — a genuine streaming
        // boundary (§5.3/§7). Every other block just renders already-resolved props,
        // so wrapping it in Suspense would add a boundary with nothing to stream.
        const rendered =
          block.__component === "blocks.article-carousel" ? (
            <Suspense fallback={<ArticleGridSkeleton />}>
              <Component {...block} />
            </Suspense>
          ) : (
            <Component {...block} />
          );

        // `block.id` is Strapi's own per-zone-entry component id — stable and unique
        // within this dynamic zone, so no array index is needed in the key. The very
        // first block on a page is never animated — it's above-the-fold content, and
        // an entrance animation there risks CLS/LCP.
        return (
          <Reveal key={`${block.__component}-${block.id}`} disabled={index === 0}>
            {rendered}
          </Reveal>
        );
      })}
    </>
  );
}
