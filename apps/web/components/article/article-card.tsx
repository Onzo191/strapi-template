import type { ArticleCard } from "@vng/shared";
import Image from "next/image";
import { Link } from "@/i18n/navigation";
import { resolveMediaUrl } from "@/lib/media";

export function ArticleCardView({ article }: { article: ArticleCard }) {
  return (
    <article className="vng-card">
      <Link href={`/tin-tuc/${article.slug}`}>
        {article.cover && (
          <Image
            src={resolveMediaUrl(article.cover.url)}
            alt={article.cover.alternativeText ?? article.title}
            width={article.cover.width ?? 640}
            height={article.cover.height ?? 360}
            style={{ width: "100%", height: "auto" }}
          />
        )}
        <div style={{ padding: "1.25rem" }}>
          {article.category && <p className="vng-eyebrow">{article.category.name}</p>}
          <h3 style={{ margin: "0.5rem 0" }}>{article.title}</h3>
          {article.excerpt && <p style={{ opacity: 0.75 }}>{article.excerpt}</p>}
        </div>
      </Link>
    </article>
  );
}
