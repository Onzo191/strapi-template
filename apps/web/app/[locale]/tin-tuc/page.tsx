import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { ArticleGrid, ArticleGridSkeleton } from "@/components/article/article-grid";
import { Pagination } from "@/components/pagination";
import { buildMetadata } from "@/lib/seo";
import { strapi } from "@/lib/strapi";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "articles" });
  // Fixed list route — path shared across locales, so no `toPath`.
  return buildMetadata(
    null,
    { title: t("title"), description: t("description") },
    { locale, path: "/tin-tuc" },
  );
}

/** The grid + pagination is its own streaming boundary — the page shell (h1) flushes immediately. */
async function ArticleListResults({ locale, page }: { locale: Locale; page: number }) {
  const t = await getTranslations("articles");
  const { data, meta } = await strapi.getArticles({ locale, page, pageSize: 12 });
  return (
    <>
      <ArticleGrid articles={data} emptyMessage={t("empty")} />
      <Pagination
        basePath="/tin-tuc"
        page={meta.pagination.page}
        pageCount={meta.pagination.pageCount}
      />
    </>
  );
}

export default async function ArticleListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { page: pageParam } = await searchParams;
  const page = Number(pageParam ?? "1") || 1;

  const t = await getTranslations("articles");

  return (
    <div className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h1 className="text-display-sm font-bold text-balance">{t("title")}</h1>
        <div className="mt-10">
          <Suspense key={page} fallback={<ArticleGridSkeleton />}>
            <ArticleListResults locale={locale} page={page} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
