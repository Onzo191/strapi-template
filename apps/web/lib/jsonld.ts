import type { Article, Block, FaqItem, Global, Locale } from "@vng/shared";
import { resolveMediaUrl } from "./media";

/**
 * JSON-LD builders (§6.3 / master_summary §5) for AIO readiness — pure
 * functions returning plain objects. `undefined` values are dropped by
 * `JSON.stringify` in `<JsonLd>`, so optional fields self-omit. Rendered as
 * `application/ld+json` so Google/LLMs read VNG's entities correctly.
 */

type JsonLdObject = Record<string, unknown>;

/** Organization node (home page). Author-provided `organizationSchema` wins. */
export function organizationSchema(global: Global | null | undefined, url: string): JsonLdObject {
  const base: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: global?.siteName ?? "VNG",
    url,
    logo: global?.logo ? resolveMediaUrl(global.logo.url) : undefined,
    sameAs: global?.socialLinks?.length ? global.socialLinks.map((l) => l.href) : undefined,
  };
  // Editor-authored schema (Global.organizationSchema) overrides/extends.
  return { ...base, ...(global?.organizationSchema ?? {}) };
}

/** Publisher Organization node embedded in NewsArticle. */
function publisherNode(global: Global | null | undefined): JsonLdObject {
  return {
    "@type": "Organization",
    name: global?.siteName ?? "VNG",
    logo: global?.logo
      ? { "@type": "ImageObject", url: resolveMediaUrl(global.logo.url) }
      : undefined,
  };
}

/** NewsArticle node (article detail) — Google News structured data. */
export function newsArticleSchema(
  article: Article,
  opts: { url: string; global: Global | null | undefined; locale: Locale },
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt ?? undefined,
    image: article.cover ? [resolveMediaUrl(article.cover.url)] : undefined,
    datePublished: article.publishedAt ?? undefined,
    dateModified: article.updatedAt ?? article.publishedAt ?? undefined,
    inLanguage: opts.locale,
    author: article.author ? { "@type": "Person", name: article.author.name } : undefined,
    publisher: publisherNode(opts.global),
    mainEntityOfPage: { "@type": "WebPage", "@id": opts.url },
  };
}

export interface BreadcrumbCrumb {
  name: string;
  url: string;
}

/** BreadcrumbList node (path-derived). */
export function breadcrumbSchema(items: BreadcrumbCrumb[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name,
      item: crumb.url,
    })),
  };
}

/** FAQPage node from a page's `blocks.faq` items. */
export function faqPageSchema(items: FaqItem[]): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** Collect FAQ items from a page-builder dynamic zone (for `faqPageSchema`). */
export function faqItemsFromBlocks(blocks: Block[] | undefined): FaqItem[] {
  const items: FaqItem[] = [];
  for (const block of blocks ?? []) {
    if (block.__component === "blocks.faq") items.push(...(block.items ?? []));
  }
  return items;
}
