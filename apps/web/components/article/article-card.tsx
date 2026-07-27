import { Badge, Card } from "@vng/design-system";
import type { ArticleCard } from "@vng/shared";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { resolveMediaUrl } from "@/lib/media";

/**
 * `priority` should only be true for the first card in a list — the realistic LCP candidate.
 * `headingLevel` defaults to `h3` (correct when nested under a block's own `h2`, e.g.
 * `article-carousel`) — list pages render this as the first heading below the page's `h1`
 * and must pass `h2` instead, or axe's heading-order check flags the skipped level.
 */
export function ArticleCardView({
  article,
  priority = false,
  headingLevel: Heading = "h3",
}: {
  article: ArticleCard;
  priority?: boolean;
  headingLevel?: "h2" | "h3";
}) {
  return (
    <Card asChild className="group overflow-hidden transition-shadow hover:shadow-md">
      <Link href={`/tin-tuc/${article.slug}`}>
        {article.cover && (
          <div className="relative aspect-video overflow-hidden bg-muted">
            <Image
              src={resolveMediaUrl(article.cover.url)}
              alt={article.cover.alternativeText ?? article.title}
              fill
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              priority={priority}
              className="object-cover transition-transform duration-300 group-hover:scale-105"
            />
          </div>
        )}
        <div className="flex flex-col gap-2 p-5">
          {article.category && <Badge>{article.category.name}</Badge>}
          <Heading className="text-lg font-semibold leading-snug">{article.title}</Heading>
          {article.excerpt && (
            <p className="line-clamp-2 text-sm text-muted-foreground">{article.excerpt}</p>
          )}
        </div>
      </Link>
    </Card>
  );
}
