import { Skeleton } from "@vng/design-system";
import type { ArticleCard } from "@vng/shared";
import { ArticleCardView } from "./article-card";

/** First card gets `priority` — it's the realistic LCP candidate on a list page. */
export function ArticleGrid({
  articles,
  emptyMessage,
}: {
  articles: ArticleCard[];
  emptyMessage: string;
}) {
  if (articles.length === 0) {
    return <p className="text-muted-foreground">{emptyMessage}</p>;
  }
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6">
      {articles.map((article, index) => (
        // `ArticleGrid` only renders directly under a list page's own `h1`
        // (tin-tuc/category/tag) — `h2` is the correct next heading level there.
        <ArticleCardView
          key={article.id}
          article={article}
          priority={index === 0}
          headingLevel="h2"
        />
      ))}
    </div>
  );
}

const SKELETON_KEYS = ["a", "b", "c", "d", "e", "f"] as const;

export function ArticleGridSkeleton() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-6">
      {SKELETON_KEYS.map((key) => (
        <Skeleton key={key} className="h-64" />
      ))}
    </div>
  );
}
