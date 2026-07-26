import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RichText } from "@/components/rich-text";
import { Link } from "@/i18n/navigation";
import { resolveMediaUrl } from "@/lib/media";
import { buildMetadata } from "@/lib/seo";
import { strapi } from "@/lib/strapi";

interface ArticlePageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const article = await strapi.getArticleBySlug(slug, locale);
  if (!article) return {};

  return buildMetadata(article.seo, {
    title: article.title,
    description: article.excerpt ?? undefined,
  });
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const article = await strapi.getArticleBySlug(slug, locale);
  if (!article) notFound();

  const t = await getTranslations("articles");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.excerpt ?? undefined,
    datePublished: article.publishedAt ?? undefined,
    author: article.author ? { "@type": "Person", name: article.author.name } : undefined,
  };

  return (
    <article className="vng-section">
      <div className="vng-container" style={{ maxWidth: "48rem" }}>
        {article.category && (
          <Link href={`/category/${article.category.slug}`} className="vng-eyebrow">
            {article.category.name}
          </Link>
        )}
        <h1 style={{ fontSize: "clamp(1.75rem, 3.5vw, 2.75rem)", marginTop: "0.5rem" }}>
          {article.title}
        </h1>
        <div style={{ display: "flex", gap: "0.75rem", opacity: 0.7, fontSize: "0.9rem" }}>
          {article.author && (
            <span>
              {t("by")} {article.author.name}
            </span>
          )}
          {article.publishedAt && (
            <time dateTime={article.publishedAt}>
              {new Intl.DateTimeFormat(locale).format(new Date(article.publishedAt))}
            </time>
          )}
        </div>

        {article.cover && (
          <Image
            src={resolveMediaUrl(article.cover.url)}
            alt={article.cover.alternativeText ?? article.title}
            width={article.cover.width ?? 1200}
            height={article.cover.height ?? 675}
            priority
            style={{ width: "100%", height: "auto", borderRadius: "0.75rem", margin: "1.5rem 0" }}
          />
        )}

        {article.body && <RichText content={article.body} />}

        {article.tags && article.tags.length > 0 && (
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "2rem" }}>
            {article.tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/tag/${tag.slug}`}
                className="vng-button vng-button--outline"
                style={{ fontSize: "0.8rem", padding: "0.375rem 0.875rem" }}
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}

        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: fixed JSON-LD payload built from validated article data, not user HTML
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </div>
    </article>
  );
}
