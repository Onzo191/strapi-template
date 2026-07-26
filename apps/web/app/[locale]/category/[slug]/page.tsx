import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArticleCardView } from "@/components/article/article-card";
import { strapi } from "@/lib/strapi";

interface CategoryPageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await strapi.getCategoryBySlug(slug, locale);
  if (!category) return {};
  return { title: category.name, description: category.description ?? undefined };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const category = await strapi.getCategoryBySlug(slug, locale);
  if (!category) notFound();

  const t = await getTranslations("articles");

  return (
    <div className="vng-section">
      <div className="vng-container">
        <p className="vng-eyebrow">{t("category")}</p>
        <h1>{category.name}</h1>
        {category.description && (
          <p style={{ opacity: 0.75, maxWidth: "42rem" }}>{category.description}</p>
        )}

        {category.articles.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <div
            className="vng-grid"
            style={{
              gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))",
              marginTop: "2rem",
            }}
          >
            {category.articles.map((article) => (
              <ArticleCardView key={article.id} article={article} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
