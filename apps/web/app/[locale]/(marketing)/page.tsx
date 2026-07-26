import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BlockRenderer } from "@/components/blocks/registry";
import { loadResilient } from "@/lib/prerender";
import { buildMetadata } from "@/lib/seo";
import { strapi } from "@/lib/strapi";

const HOME_SLUG = "home";

interface HomePageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: HomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const landing = await loadResilient(() => strapi.getLandingPageBySlug(HOME_SLUG, locale));
  if (!landing) return {};
  return buildMetadata(landing.seo, { title: landing.title });
}

/** Home shell — a block-composed `landing-page` (slug `home`), prerendered + ISR (§5.1). */
export default async function HomePage({ params }: HomePageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const landing = await loadResilient(() => strapi.getLandingPageBySlug(HOME_SLUG, locale));
  if (!landing) notFound();

  return <BlockRenderer blocks={landing.blocks ?? []} />;
}
