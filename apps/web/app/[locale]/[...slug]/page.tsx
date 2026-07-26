import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BlockRenderer } from "@/components/blocks/registry";
import { JsonLd } from "@/components/seo/json-ld";
import { getPathname } from "@/i18n/navigation";
import { breadcrumbSchema, faqItemsFromBlocks, faqPageSchema } from "@/lib/jsonld";
import { buildMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { strapi } from "@/lib/strapi";

interface LandingRouteProps {
  params: Promise<{ locale: Locale; slug: string[] }>;
}

const landingPath = (slug: string) => `/${slug}`;

/** Static segments under `(marketing)` (`/about`, `/legal`, …) win over this catch-all. */
export default async function LandingRoute({ params }: LandingRouteProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const { isEnabled: preview } = await draftMode();
  const [landing, global] = await Promise.all([
    strapi.getLandingPageBySlug(slug.join("/"), locale, preview),
    strapi.getGlobal(locale),
  ]);
  if (!landing) notFound();

  const url = absoluteUrl(getPathname({ locale, href: landingPath(slug.join("/")) }));
  const faqItems = faqItemsFromBlocks(landing.blocks);
  const jsonLd: object[] = [
    breadcrumbSchema([
      { name: global?.siteName ?? "VNG", url: absoluteUrl(getPathname({ locale, href: "/" })) },
      { name: landing.title, url },
    ]),
  ];
  if (faqItems.length > 0) jsonLd.push(faqPageSchema(faqItems));

  return (
    <>
      <BlockRenderer blocks={landing.blocks ?? []} />
      <JsonLd data={jsonLd} />
    </>
  );
}

export async function generateMetadata({ params }: LandingRouteProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const { isEnabled: preview } = await draftMode();
  const [landing, global] = await Promise.all([
    strapi.getLandingPageBySlug(slug.join("/"), locale, preview),
    strapi.getGlobal(locale),
  ]);
  if (!landing) return {};

  return buildMetadata(
    landing.seo,
    { title: landing.title },
    {
      locale,
      path: landingPath(slug.join("/")),
      localizations: landing.localizations,
      toPath: landingPath,
      siteName: global?.siteName,
    },
  );
}
