import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { draftMode } from "next/headers";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BlockRenderer } from "@/components/blocks/registry";
import { JsonLd } from "@/components/seo/json-ld";
import { faqItemsFromBlocks, faqPageSchema, organizationSchema } from "@/lib/jsonld";
import { loadResilient } from "@/lib/prerender";
import { buildMetadata } from "@/lib/seo";
import { absoluteUrl } from "@/lib/site";
import { strapi } from "@/lib/strapi";

const HOME_SLUG = "home";

interface HomePageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const { isEnabled: preview } = await draftMode();
  const [landing, global] = await loadResilient(() =>
    Promise.all([
      strapi.getLandingPageBySlug(HOME_SLUG, locale, preview),
      strapi.getGlobal(locale),
    ]),
  );
  if (!landing) return {};

  // Home is served at `/` in each locale (not `/home`), so no `toPath`.
  return buildMetadata(
    landing.seo,
    { title: landing.title },
    { locale, path: "/", siteName: global?.siteName },
  );
}

/** Home shell — a block-composed `landing-page` (slug `home`), prerendered + ISR (§5.1). */
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const { isEnabled: preview } = await draftMode();
  const [landing, global] = await loadResilient(() =>
    Promise.all([
      strapi.getLandingPageBySlug(HOME_SLUG, locale, preview),
      strapi.getGlobal(locale),
    ]),
  );
  if (!landing) notFound();

  // Organization schema is emitted once, on the home page (§6.3).
  const jsonLd: object[] = [organizationSchema(global, absoluteUrl("/"))];
  const faqItems = faqItemsFromBlocks(landing.blocks);
  if (faqItems.length > 0) jsonLd.push(faqPageSchema(faqItems));

  return (
    <>
      <BlockRenderer blocks={landing.blocks ?? []} />
      <JsonLd data={jsonLd} />
    </>
  );
}
