/**
 * Zod schemas for the reusable sub-components blocks are built from (§4.2).
 * Kept permissive on media (only the fields the FE actually renders) so
 * upload-provider differences (local vs S3) never fail validation.
 */
import { z } from "zod";

export const zStrapiMedia = z.object({
  id: z.number(),
  documentId: z.string(),
  url: z.string(),
  alternativeText: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  mime: z.string().optional(),
});

export const zLinkComponent = z.object({
  id: z.number(),
  label: z.string(),
  href: z.string(),
  target: z.enum(["_self", "_blank"]),
  variant: z.enum(["primary", "secondary", "outline", "link"]),
  icon: z.string().nullable().optional(),
});

export const zGalleryImage = z.object({
  id: z.number(),
  image: zStrapiMedia,
  caption: z.string().nullable().optional(),
  alt: z.string().nullable().optional(),
});

export const zFeatureItem = z.object({
  id: z.number(),
  icon: z.string().nullable().optional(),
  title: z.string(),
  description: z.string().nullable().optional(),
  link: zLinkComponent.nullable().optional(),
});

export const zStatItem = z.object({
  id: z.number(),
  value: z.string(),
  label: z.string(),
  prefix: z.string().nullable().optional(),
  suffix: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
});

export const zLogoItem = z.object({
  id: z.number(),
  name: z.string(),
  logo: zStrapiMedia.nullable().optional(),
  url: z.string().nullable().optional(),
});

export const zTimelineItem = z.object({
  id: z.number(),
  date: z.string(),
  title: z.string(),
  description: z.string().nullable().optional(),
  media: zStrapiMedia.nullable().optional(),
});

export const zLeaderItem = z.object({
  id: z.number(),
  name: z.string(),
  role: z.string().nullable().optional(),
  photo: zStrapiMedia.nullable().optional(),
  bio: z.string().nullable().optional(),
  socials: z.array(zLinkComponent).optional(),
});

export const zFaqItem = z.object({
  id: z.number(),
  question: z.string(),
  answer: z.string(),
});

export const zTestimonialItem = z.object({
  id: z.number(),
  quote: z.string(),
  authorName: z.string(),
  authorRole: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  avatar: zStrapiMedia.nullable().optional(),
  rating: z.number().nullable().optional(),
});

export const zFormField = z.object({
  id: z.number(),
  name: z.string(),
  label: z.string(),
  type: z.enum(["text", "email", "tel", "textarea", "select", "checkbox"]),
  placeholder: z.string().nullable().optional(),
  required: z.boolean(),
  options: z.string().nullable().optional(),
});
