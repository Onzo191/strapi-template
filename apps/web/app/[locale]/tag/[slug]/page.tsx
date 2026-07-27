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

interface TagPageProps {
  params: Promise<{ locale: Locale; slug: string }>;
  searchParams: Promise<{ page?: string }>;
}

const tagPath = (slug: string) => `/tag/${slug}`;

export async function generateMetadata({
  params,
}: Pick<TagPageProps, "params">): Promise<Metadata> {
  const { locale, slug } = await params;
  const tag = await strapi.getTagBySlug(slug, locale);
  if (!tag) return {};
  const t = await getTranslations({ locale, namespace: "tag" });
  return buildMetadata(
    null,
    { title: `#${tag.name}`, description: t("description", { name: tag.name }) },
    { locale, path: tagPath(slug), localizations: tag.localizations, toPath: tagPath },
  );
}

/** Own streaming boundary — fetched via `getArticles({ tag })`, not `tag.articles`, so it's
 * paginated and can suspend after the h1/breadcrumb have already flushed. */
async function TagArticles({ locale, slug, page }: { locale: Locale; slug: string; page: number }) {
  const t = await getTranslations("articles");
  const { data, meta } = await strapi.getArticles({ locale, tag: slug, page, pageSize: 12 });
  return (
    <>
      <ArticleGrid articles={data} emptyMessage={t("empty")} />
      <Pagination
        basePath={tagPath(slug)}
        page={meta.pagination.page}
        pageCount={meta.pagination.pageCount}
      />
    </>
  );
}

export default async function TagPage({ params, searchParams }: TagPageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const tag = await strapi.getTagBySlug(slug, locale);
  if (!tag) notFound();

  const { page: pageParam } = await searchParams;
  const page = Number(pageParam ?? "1") || 1;

  const t = await getTranslations("articles");

  const jsonLd = breadcrumbSchema([
    { name: t("title"), url: absoluteUrl(getPathname({ locale, href: "/tin-tuc" })) },
    { name: `#${tag.name}`, url: absoluteUrl(getPathname({ locale, href: tagPath(slug) })) },
  ]);

  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <Badge>{t("tags")}</Badge>
        <h1 className="mt-2 text-display-sm font-bold text-balance">#{tag.name}</h1>
        <JsonLd data={jsonLd} />

        <div className="mt-10">
          <Suspense key={page} fallback={<ArticleGridSkeleton />}>
            <TagArticles locale={locale} slug={slug} page={page} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
