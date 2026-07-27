import { badgeVariants } from "@vng/design-system";
import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { RichText } from "@/components/rich-text";
import { JsonLd } from "@/components/seo/json-ld";
import { getPathname, Link } from "@/i18n/navigation";
import { breadcrumbSchema, newsArticleSchema } from "@/lib/jsonld";
import { resolveMediaUrl } from "@/lib/media";
import { buildMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { strapi } from "@/lib/strapi";

interface ArticlePageProps {
  params: Promise<{ locale: Locale; slug: string }>;
}

const articlePath = (slug: string) => `/tin-tuc/${slug}`;

export async function generateMetadata({ params }: ArticlePageProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const { isEnabled: preview } = await draftMode();
  const [article, global] = await Promise.all([
    strapi.getArticleBySlug(slug, locale, preview),
    strapi.getGlobal(locale),
  ]);
  if (!article) return {};

  return buildMetadata(
    article.seo,
    { title: article.title, description: article.excerpt ?? undefined },
    {
      locale,
      path: articlePath(slug),
      localizations: article.localizations,
      toPath: articlePath,
      ogType: "article",
      siteName: global?.siteName,
    },
  );
}

export default async function ArticlePage({ params }: ArticlePageProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const { isEnabled: preview } = await draftMode();
  const [article, global] = await Promise.all([
    strapi.getArticleBySlug(slug, locale, preview),
    strapi.getGlobal(locale),
  ]);
  if (!article) notFound();

  const t = await getTranslations("articles");

  const url = absoluteUrl(getPathname({ locale, href: articlePath(slug) }));
  const crumbs = [
    { name: global?.siteName ?? "VNG", url: absoluteUrl(getPathname({ locale, href: "/" })) },
    { name: t("title"), url: absoluteUrl(getPathname({ locale, href: "/tin-tuc" })) },
    ...(article.category
      ? [
          {
            name: article.category.name,
            url: absoluteUrl(getPathname({ locale, href: `/category/${article.category.slug}` })),
          },
        ]
      : []),
    { name: article.title, url },
  ];

  const jsonLd = [newsArticleSchema(article, { url, global, locale }), breadcrumbSchema(crumbs)];

  return (
    <article className="py-16 md:py-24">
      <div className="mx-auto max-w-3xl px-6">
        {article.category && (
          <Link
            href={`/category/${article.category.slug}`}
            className={badgeVariants({ variant: "default" })}
          >
            {article.category.name}
          </Link>
        )}
        <h1 className="mt-2 text-display-sm font-bold text-balance">{article.title}</h1>
        <div className="mt-3 flex gap-3 text-sm text-muted-foreground">
          {article.author && (
            <span>
              {t("by")} {article.author.name}
            </span>
          )}
          {article.publishedAt && (
            <time dateTime={article.publishedAt}>
              {new Intl.DateTimeFormat(locale).format(new Date(article.publishedAt))}
            </time>
          )}
        </div>

        {article.cover && (
          <Image
            src={resolveMediaUrl(article.cover.url)}
            alt={article.cover.alternativeText ?? article.title}
            width={article.cover.width ?? 1200}
            height={article.cover.height ?? 675}
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="my-8 w-full rounded-xl"
          />
        )}

        {article.body && <RichText content={article.body} />}

        {article.tags && article.tags.length > 0 && (
          <div className="mt-8 flex flex-wrap gap-2">
            {article.tags.map((tag) => (
              <Link
                key={tag.id}
                href={`/tag/${tag.slug}`}
                className="rounded-full border border-border px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                #{tag.name}
              </Link>
            ))}
          </div>
        )}

        <JsonLd data={jsonLd} />
      </div>
    </article>
  );
}
