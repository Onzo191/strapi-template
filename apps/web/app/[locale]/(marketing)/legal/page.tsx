import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BlockRenderer } from "@/components/blocks/registry";
import { loadResilient } from "@/lib/prerender";
import { buildMetadata } from "@/lib/seo";
import { strapi } from "@/lib/strapi";

const SLUG = "legal";

interface LegalPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: LegalPageProps): Promise<Metadata> {
  const { locale } = await params;
  const page = await loadResilient(() => strapi.getPageBySlug(SLUG, locale));
  if (!page) return {};
  return buildMetadata(page.seo, { title: page.title });
}

/** Static shell page (§4.1 `page` content type) — rarely-changing, long cacheLife. */
export default async function LegalPage({ params }: LegalPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);

  const page = await loadResilient(() => strapi.getPageBySlug(SLUG, locale));
  if (!page) notFound();

  return <BlockRenderer blocks={page.blocks ?? []} />;
}
