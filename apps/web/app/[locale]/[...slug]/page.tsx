import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { BlockRenderer } from "@/components/blocks/registry";
import { buildMetadata } from "@/lib/seo";
import { strapi } from "@/lib/strapi";

interface LandingRouteProps {
  params: Promise<{ locale: Locale; slug: string[] }>;
}

/** Static segments under `(marketing)` (`/about`, `/legal`, …) win over this catch-all. */
export default async function LandingRoute({ params }: LandingRouteProps) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const landing = await strapi.getLandingPageBySlug(slug.join("/"), locale);
  if (!landing) notFound();

  return <BlockRenderer blocks={landing.blocks ?? []} />;
}

export async function generateMetadata({ params }: LandingRouteProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const landing = await strapi.getLandingPageBySlug(slug.join("/"), locale);
  if (!landing) return {};
  return buildMetadata(landing.seo, { title: landing.title });
}
