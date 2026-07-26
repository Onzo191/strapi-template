import type { ArticleCard, ArticleCarouselBlock, Locale } from "@vng/shared";
import { getLocale } from "next-intl/server";
import { ArticleCardView } from "@/components/article/article-card";
import { Link } from "@/i18n/navigation";
import { strapi } from "@/lib/strapi";

/** Auto-pulls the latest N articles (optionally by category), or renders a manual pick. */
export async function ArticleCarousel(block: ArticleCarouselBlock) {
  const locale = (await getLocale()) as Locale;

  if (block.autoPull) {
    const { data } = await strapi.getArticles({
      locale,
      pageSize: block.limit,
      category: block.category?.slug,
    });
    return <ArticleCarouselView heading={block.heading} articles={data} />;
  }

  // Manual pick: the dynamic zone only stores {slug, title} refs, so this renders a
  // lighter link list rather than fetching each article's full card (avoids N+1, §4.4).
  const picks = block.articles?.slice(0, block.limit) ?? [];
  if (picks.length === 0) return null;

  return (
    <section className="vng-section">
      <div className="vng-container">
        {block.heading && <h2>{block.heading}</h2>}
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {picks.map((pick) => (
            <li
              key={pick.id}
              style={{ padding: "0.75rem 0", borderBottom: "1px solid var(--vng-border)" }}
            >
              <Link href={`/tin-tuc/${pick.slug}`}>{pick.title}</Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ArticleCarouselView({
  heading,
  articles,
}: {
  heading?: string | null;
  articles: ArticleCard[];
}) {
  if (articles.length === 0) return null;
  return (
    <section className="vng-section">
      <div className="vng-container">
        {heading && <h2>{heading}</h2>}
        <div
          className="vng-grid"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(16rem, 1fr))" }}
        >
          {articles.map((article) => (
            <ArticleCardView key={article.id} article={article} />
          ))}
        </div>
      </div>
    </section>
  );
}
