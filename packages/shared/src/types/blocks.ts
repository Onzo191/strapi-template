/**
 * Page-builder block library (§4.2) as a discriminated union.
 *
 * Every dynamic-zone entry carries `__component` (Strapi's polymorphic
 * discriminant). The FE renders these via a typed block registry
 * (`__component → React component`) — see `.claude/skills/add-page-builder-block`.
 */

import type {
  FaqItem,
  FeatureItem,
  FormField,
  GalleryImage,
  LeaderItem,
  LinkComponent,
  LogoItem,
  RichTextBlocks,
  StatItem,
  TestimonialItem,
  TimelineItem,
} from "./components";
import type { StrapiMedia } from "./media";

interface BlockBase {
  id: number;
}

export interface HeroBlock extends BlockBase {
  __component: "blocks.hero";
  heading: string;
  subheading?: string | null;
  eyebrow?: string | null;
  media?: StrapiMedia | null;
  background: "default" | "muted" | "dark" | "gradient";
  alignment: "left" | "center";
  actions?: LinkComponent[];
}

export interface RichTextBlock extends BlockBase {
  __component: "blocks.rich-text";
  content: RichTextBlocks;
  width: "narrow" | "default" | "wide";
}

export interface MediaBlock extends BlockBase {
  __component: "blocks.media";
  file: StrapiMedia;
  caption?: string | null;
  alt?: string | null;
  width: "narrow" | "default" | "wide" | "full";
}

export interface ImageGalleryBlock extends BlockBase {
  __component: "blocks.image-gallery";
  title?: string | null;
  images: GalleryImage[];
  columns: number;
}

export interface CtaBlock extends BlockBase {
  __component: "blocks.cta";
  heading: string;
  description?: string | null;
  actions?: LinkComponent[];
  background: "default" | "muted" | "dark" | "gradient";
}

export interface FeatureGridBlock extends BlockBase {
  __component: "blocks.feature-grid";
  heading?: string | null;
  description?: string | null;
  features: FeatureItem[];
  columns: number;
}

export interface StatsBlock extends BlockBase {
  __component: "blocks.stats";
  heading?: string | null;
  stats: StatItem[];
}

export interface LogoCloudBlock extends BlockBase {
  __component: "blocks.logo-cloud";
  heading?: string | null;
  logos: LogoItem[];
}

export interface TimelineBlock extends BlockBase {
  __component: "blocks.timeline";
  heading?: string | null;
  events: TimelineItem[];
}

export interface LeadershipGridBlock extends BlockBase {
  __component: "blocks.leadership-grid";
  heading?: string | null;
  leaders: LeaderItem[];
}

export interface FaqBlock extends BlockBase {
  __component: "blocks.faq";
  heading?: string | null;
  items: FaqItem[];
}

export interface TestimonialBlock extends BlockBase {
  __component: "blocks.testimonial";
  heading?: string | null;
  items: TestimonialItem[];
}

export interface EmbedBlock extends BlockBase {
  __component: "blocks.embed";
  title?: string | null;
  url?: string | null;
  embedCode?: string | null;
  provider: "iframe" | "youtube" | "vimeo" | "custom";
  aspectRatio: "16:9" | "4:3" | "1:1";
  height?: number | null;
}

/** Auto-pulls latest N articles (optionally filtered by category), or a manual pick. */
export interface ArticleCarouselBlock extends BlockBase {
  __component: "blocks.article-carousel";
  heading?: string | null;
  autoPull: boolean;
  limit: number;
  category?: { id: number; documentId: string; slug: string } | null;
  articles?: Array<{ id: number; documentId: string; slug: string; title: string }>;
}

export interface ContactFormBlock extends BlockBase {
  __component: "blocks.contact-form";
  heading?: string | null;
  description?: string | null;
  submitLabel: string;
  successMessage?: string | null;
  endpoint?: string | null;
  fields: FormField[];
}

/** Discriminated union of every page-builder block. */
export type Block =
  | HeroBlock
  | RichTextBlock
  | MediaBlock
  | ImageGalleryBlock
  | CtaBlock
  | FeatureGridBlock
  | StatsBlock
  | LogoCloudBlock
  | TimelineBlock
  | LeadershipGridBlock
  | FaqBlock
  | TestimonialBlock
  | EmbedBlock
  | ArticleCarouselBlock
  | ContactFormBlock;

/** The `__component` string literal for every block. */
export type BlockComponent = Block["__component"];

/** Every block `__component` value — the canonical dynamic-zone component list. */
export const BLOCK_COMPONENTS = [
  "blocks.hero",
  "blocks.rich-text",
  "blocks.media",
  "blocks.image-gallery",
  "blocks.cta",
  "blocks.feature-grid",
  "blocks.stats",
  "blocks.logo-cloud",
  "blocks.timeline",
  "blocks.leadership-grid",
  "blocks.faq",
  "blocks.testimonial",
  "blocks.embed",
  "blocks.article-carousel",
  "blocks.contact-form",
] as const satisfies readonly BlockComponent[];
