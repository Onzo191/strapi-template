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
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        {block.heading && (
          <h2 className="mb-4 text-display-sm font-bold text-balance">{block.heading}</h2>
        )}
        <ul className="m-0 list-none divide-y divide-border p-0">
          {picks.map((pick) => (
            <li key={pick.id} className="py-3">
              <Link
                href={`/tin-tuc/${pick.slug}`}
                className="font-medium hover:text-primary hover:underline"
              >
                {pick.title}
              </Link>
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
    <section className="py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        {heading && <h2 className="mb-8 text-display-sm font-bold text-balance">{heading}</h2>}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6">
          {articles.map((article) => (
            // No `priority` here: this block usually sits below a page's own Hero image,
            // which already claims the LCP slot — see the dedicated list pages for where
            // the first card genuinely is the LCP candidate.
            <ArticleCardView key={article.id} article={article} />
          ))}
        </div>
      </div>
    </section>
  );
}
