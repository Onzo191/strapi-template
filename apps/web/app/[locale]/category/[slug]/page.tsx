import { Badge } from "@vng/design-system";
import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ArticleGrid, ArticleGridSkeleton } from "@/components/article/article-grid";
import { Pagination } from "@/components/pagination";
import { JsonLd } from "@/components/seo/json-ld";
import { getPathname } from "@/i18n/navigation";
import { breadcrumbSchema } from "@/lib/jsonld";
import { buildMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { strapi } from "@/lib/strapi";

interface CategoryPageProps {
  params: Promise<{ locale: Locale; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

const categoryPath = (slug: string) => `/category/${slug}`;

export async function generateMetadata({
  params,
}: Pick<CategoryPageProps, "params">): Promise<Metadata> {
  const { locale, slug } = await params;
  const category = await strapi.getCategoryBySlug(slug, locale);
  if (!category) return {};
  return buildMetadata(
    null,
    { title: category.name, description: category.description ?? undefined },
    {
      locale,
      path: categoryPath(slug),
      localizations: category.localizations,
      toPath: categoryPath,
    },
  );
}

/**
 * Own streaming boundary, fetched independently of the category shell above via
 * `getArticles({ category })` (the same filter the article-carousel block and the
 * `tin-tuc` list use) rather than `category.articles` — that keeps this paginated
 * and lets it suspend after the h1/breadcrumb have already flushed.
 */
async function CategoryArticles({
  locale,
  slug,
  page,
}: {
  locale: Locale;
  slug: string;
  page: number;
}) {
  const t = await getTranslations("articles");
  const { data, meta } = await strapi.getArticles({ locale, category: slug, page, pageSize: 12 });
  return (
    <>
      <ArticleGrid articles={data} emptyMessage={t("empty")} />
      <Pagination
        basePath={categoryPath(slug)}
        page={meta.pagination.page}
        pageCount={meta.pagination.pageCount}
      />
    </>
  );
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const category = await strapi.getCategoryBySlug(slug, locale);
  if (!category) notFound();

  const { page: pageParam } = await searchParams;
  const page = Number(pageParam ?? "1") || 1;

  const t = await getTranslations("articles");

  const jsonLd = breadcrumbSchema([
    { name: t("title"), url: absoluteUrl(getPathname({ locale, href: "/tin-tuc" })) },
    { name: category.name, url: absoluteUrl(getPathname({ locale, href: categoryPath(slug) })) },
  ]);

  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Badge>{t("category")}</Badge>
        <h1 className="mt-2 text-display-sm font-bold text-balance">{category.name}</h1>
        {category.description && (
          <p className="mt-2 max-w-2xl text-muted-foreground">{category.description}</p>
        )}
        <JsonLd data={jsonLd} />

        <div className="mt-10">
          <Suspense key={page} fallback={<ArticleGridSkeleton />}>
            <CategoryArticles locale={locale} slug={slug} page={page} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
