/**
 * Zod schemas for the page-builder block library (§4.2), one per block plus
 * a discriminated union keyed on `__component`. The block registry (apps/web)
 * `safeParse`s every raw dynamic-zone entry against `zBlock` before handing
 * it to a component — a malformed editor entry is skipped instead of
 * crashing the render. Adding a block = add its schema here (recipe in §7).
 */
import { z } from "zod";
import {
  zFaqItem,
  zFeatureItem,
  zFormField,
  zGalleryImage,
  zLeaderItem,
  zLinkComponent,
  zLogoItem,
  zStatItem,
  zStrapiMedia,
  zTestimonialItem,
  zTimelineItem,
} from "./components";

const zBlockBase = { id: z.number() };

export const zHeroBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.hero"),
  heading: z.string(),
  subheading: z.string().nullable().optional(),
  eyebrow: z.string().nullable().optional(),
  media: zStrapiMedia.nullable().optional(),
  background: z.enum(["default", "muted", "dark", "gradient"]),
  alignment: z.enum(["left", "center"]),
  actions: z.array(zLinkComponent).optional(),
});

export const zRichTextBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.rich-text"),
  content: z.array(z.unknown()),
  width: z.enum(["narrow", "default", "wide"]),
});

export const zMediaBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.media"),
  file: zStrapiMedia,
  caption: z.string().nullable().optional(),
  alt: z.string().nullable().optional(),
  width: z.enum(["narrow", "default", "wide", "full"]),
});

export const zImageGalleryBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.image-gallery"),
  title: z.string().nullable().optional(),
  images: z.array(zGalleryImage),
  columns: z.number(),
});

export const zCtaBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.cta"),
  heading: z.string(),
  description: z.string().nullable().optional(),
  actions: z.array(zLinkComponent).optional(),
  background: z.enum(["default", "muted", "dark", "gradient"]),
});

export const zFeatureGridBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.feature-grid"),
  heading: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  features: z.array(zFeatureItem),
  columns: z.number(),
});

export const zStatsBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.stats"),
  heading: z.string().nullable().optional(),
  stats: z.array(zStatItem),
});

export const zLogoCloudBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.logo-cloud"),
  heading: z.string().nullable().optional(),
  logos: z.array(zLogoItem),
});

export const zTimelineBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.timeline"),
  heading: z.string().nullable().optional(),
  events: z.array(zTimelineItem),
});

export const zLeadershipGridBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.leadership-grid"),
  heading: z.string().nullable().optional(),
  leaders: z.array(zLeaderItem),
});

export const zFaqBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.faq"),
  heading: z.string().nullable().optional(),
  items: z.array(zFaqItem),
});

export const zTestimonialBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.testimonial"),
  heading: z.string().nullable().optional(),
  items: z.array(zTestimonialItem),
});

export const zEmbedBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.embed"),
  title: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  embedCode: z.string().nullable().optional(),
  provider: z.enum(["iframe", "youtube", "vimeo", "custom"]),
  aspectRatio: z.enum(["16:9", "4:3", "1:1"]),
  height: z.number().nullable().optional(),
});

export const zArticleCarouselBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.article-carousel"),
  heading: z.string().nullable().optional(),
  autoPull: z.boolean(),
  limit: z.number(),
  category: z
    .object({ id: z.number(), documentId: z.string(), slug: z.string() })
    .nullable()
    .optional(),
  articles: z
    .array(
      z.object({ id: z.number(), documentId: z.string(), slug: z.string(), title: z.string() }),
    )
    .optional(),
});

export const zContactFormBlock = z.object({
  ...zBlockBase,
  __component: z.literal("blocks.contact-form"),
  heading: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  submitLabel: z.string(),
  successMessage: z.string().nullable().optional(),
  endpoint: z.string().nullable().optional(),
  fields: z.array(zFormField),
});

/** Discriminated union of every page-builder block — mirrors `Block` in `types/blocks.ts`. */
export const zBlock = z.discriminatedUnion("__component", [
  zHeroBlock,
  zRichTextBlock,
  zMediaBlock,
  zImageGalleryBlock,
  zCtaBlock,
  zFeatureGridBlock,
  zStatsBlock,
  zLogoCloudBlock,
  zTimelineBlock,
  zLeadershipGridBlock,
  zFaqBlock,
  zTestimonialBlock,
  zEmbedBlock,
  zArticleCarouselBlock,
  zContactFormBlock,
]);
