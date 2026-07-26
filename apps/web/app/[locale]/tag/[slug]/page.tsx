import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArticleCardView } from "@/components/article/article-card";
import { strapi } from "@/lib/strapi";

interface TagPageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export async function generateMetadata({ params }: TagPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const tag = await strapi.getTagBySlug(slug, locale);
  if (!tag) return {};
  return { title: `#${tag.name}` };
}

export default async function TagPage({ params }: TagPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const tag = await strapi.getTagBySlug(slug, locale);
  if (!tag) notFound();

  const t = await getTranslations("articles");

  return (
    <div className="vng-section">
      <div className="vng-container">
        <p className="vng-eyebrow">{t("tags")}</p>
        <h1>#{tag.name}</h1>

        {tag.articles.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <div
            className="vng-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))",
              marginTop: "2rem",
            }}
          >
            {tag.articles.map((article) => (
              <ArticleCardView key={article.id} article={article} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
