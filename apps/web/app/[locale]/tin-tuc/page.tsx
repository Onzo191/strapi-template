import type { Locale } from "@vng/shared";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArticleCardView } from "@/components/article/article-card";
import { Pagination } from "@/components/pagination";
import { strapi } from "@/lib/strapi";

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
  const { data, meta } = await strapi.getArticles({ locale, page, pageSize: 12 });

  return (
    <div className="vng-section">
      <div className="vng-container">
        <h1>{t("title")}</h1>
        {data.length === 0 ? (
          <p>{t("empty")}</p>
        ) : (
          <div
            className="vng-grid"
            style={{ gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))" }}
          >
            {data.map((article) => (
              <ArticleCardView key={article.id} article={article} />
            ))}
          </div>
        )}
        <Pagination
          basePath="/tin-tuc"
          page={meta.pagination.page}
          pageCount={meta.pagination.pageCount}
        />
      </div>
    </div>
  );
}
