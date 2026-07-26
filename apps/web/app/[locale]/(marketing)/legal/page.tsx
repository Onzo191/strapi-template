import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BlockRenderer } from "@/components/blocks/registry";
import { JsonLd } from "@/components/seo/json-ld";
import { getPathname } from "@/i18n/navigation";
import { breadcrumbSchema, faqItemsFromBlocks, faqPageSchema } from "@/lib/jsonld";
import { loadResilient } from "@/lib/prerender";
import { buildMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { strapi } from "@/lib/strapi";

const SLUG = "legal";
const PATH = `/${SLUG}`;

interface LegalPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const { locale } = await params;
  const { isEnabled: preview } = await draftMode();
  const [page, global] = await loadResilient(() =>
    Promise.all([strapi.getPageBySlug(SLUG, locale, preview), strapi.getGlobal(locale)]),
  );
  if (!page) return {};
  return buildMetadata(
    page.seo,
    { title: page.title },
    { locale, path: PATH, siteName: global?.siteName },
  );
}

/** Static shell page (§4.1 `page` content type) — rarely-changing, long cacheLife. */
export default async function LegalPage({ params }: LegalPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { isEnabled: preview } = await draftMode();
  const [page, global] = await loadResilient(() =>
    Promise.all([strapi.getPageBySlug(SLUG, locale, preview), strapi.getGlobal(locale)]),
  );
  if (!page) notFound();

  const jsonLd: object[] = [
    breadcrumbSchema([
      { name: global?.siteName ?? "VNG", url: absoluteUrl(getPathname({ locale, href: "/" })) },
      { name: page.title, url: absoluteUrl(getPathname({ locale, href: PATH })) },
    ]),
  ];
  const faqItems = faqItemsFromBlocks(page.blocks);
  if (faqItems.length > 0) jsonLd.push(faqPageSchema(faqItems));

  return (
    <>
      <BlockRenderer blocks={page.blocks ?? []} />
      <JsonLd data={jsonLd} />
    </>
  );
}
