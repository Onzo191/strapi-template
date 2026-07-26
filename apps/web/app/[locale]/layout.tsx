import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { Footer } from "@/components/layout/footer";
import { Header } from "@/components/layout/header";
import { routing } from "@/i18n/routing";
import { loadResilient } from "@/lib/prerender";
import { siteUrl } from "@/lib/site";
import { strapi } from "@/lib/strapi";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const global = await loadResilient(() => strapi.getGlobal(locale as Locale));
  const siteName = global?.siteName ?? "VNG";

  return {
    // Absolute base so per-page relative canonical/OG/hreflang resolve (§6.3).
    metadataBase: siteUrl,
    title: { default: siteName, template: `%s · ${siteName}` },
    description: global?.siteDescription ?? undefined,
    openGraph: { siteName, locale: locale === "vi" ? "vi_VN" : "en_US", type: "website" },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const [messages, header, footer, global] = await loadResilient(() =>
    Promise.all([
      getMessages(),
      strapi.getNavigationBySlug("main-header", locale),
      strapi.getNavigationBySlug("main-footer", locale),
      strapi.getGlobal(locale),
    ]),
  );

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          <Header navigation={header} global={global} />
          <main>{children}</main>
          <Footer navigation={footer} global={global} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
