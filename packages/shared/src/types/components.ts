/**
 * Reusable component shapes: the shared SEO component (§4.3), links, and the
 * page-builder block library (§4.2). Types mirror the Strapi component schemas
 * one-to-one so the FE block registry (P2) can render a typed `Block` union.
 */

import type { StrapiMedia } from "./media";

/** Rich-text blocks — Strapi's native `blocks` editor payload. */
export type RichTextBlocks = unknown[];

/** Shared SEO component (§4.3) — attached to article / landing-page / page. */
export interface SeoComponent {
  id: number;
  metaTitle: string;
  metaDescription: string;
  canonicalURL?: string | null;
  ogImage?: StrapiMedia | null;
  noindex: boolean;
  structuredData?: Record<string, unknown> | null;
  keywords?: string | null;
}

export interface LinkComponent {
  id: number;
  label: string;
  href: string;
  target: "_self" | "_blank";
  variant: "primary" | "secondary" | "outline" | "link";
  icon?: string | null;
}

// --- element sub-components -------------------------------------------------

export interface GalleryImage {
  id: number;
  image: StrapiMedia;
  caption?: string | null;
  alt?: string | null;
}

export interface FeatureItem {
  id: number;
  icon?: string | null;
  title: string;
  description?: string | null;
  link?: LinkComponent | null;
}

export interface StatItem {
  id: number;
  value: string;
  label: string;
  prefix?: string | null;
  suffix?: string | null;
  description?: string | null;
}

export interface LogoItem {
  id: number;
  name: string;
  logo?: StrapiMedia | null;
  url?: string | null;
}

export interface TimelineItem {
  id: number;
  date: string;
  title: string;
  description?: string | null;
  media?: StrapiMedia | null;
}

export interface LeaderItem {
  id: number;
  name: string;
  role?: string | null;
  photo?: StrapiMedia | null;
  bio?: string | null;
  socials?: LinkComponent[];
}

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
}

export interface TestimonialItem {
  id: number;
  quote: string;
  authorName: string;
  authorRole?: string | null;
  company?: string | null;
  avatar?: StrapiMedia | null;
  rating?: number | null;
}

export interface FormField {
  id: number;
  name: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "select" | "checkbox";
  placeholder?: string | null;
  required: boolean;
  options?: string | null;
}

// --- navigation ------------------------------------------------------------

export interface NavLink {
  id: number;
  label: string;
  url?: string | null;
  target: "_self" | "_blank";
}

export interface NavItem {
  id: number;
  label: string;
  url?: string | null;
  target: "_self" | "_blank";
  page?: { id: number; documentId: string; slug: string } | null;
  children?: NavLink[];
}
