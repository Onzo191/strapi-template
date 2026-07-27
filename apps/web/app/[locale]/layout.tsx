import { ThemeProvider } from "@vng/design-system";
import type { Locale } from "@vng/shared";
import type { Metadata } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
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

// Self-hosted (Next downloads + serves the font files itself, no runtime
// Google requests) with a native `vietnamese` subset — satisfies §6.4
// without a manual subsetting pipeline. Three weights (400 body, 600
// medium/heading, 700 hero) keep the preloaded critical-path bytes down —
// the LCP element is heading text, so fewer competing font files on a
// throttled link lets it swap-repaint sooner.
const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["vietnamese", "latin"],
  weight: ["400", "600", "700"],
  display: "swap",
  preload: true,
  variable: "--font-be-vietnam-pro",
});

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
    <html lang={locale} className={beVietnamPro.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider>
          <NextIntlClientProvider messages={messages}>
            <Header navigation={header} global={global} />
            <main>{children}</main>
            <Footer navigation={footer} global={global} />
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
