"use client";

import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** Locale toggle — the layout's one client island (needs the current pathname). */
export function LocaleSwitcher() {
  const pathname = usePathname();
  const activeLocale = useLocale();

  return (
    <nav aria-label="Language" className="vng-locale-switcher">
      {routing.locales.map((locale) => (
        <Link key={locale} href={pathname} locale={locale} aria-current={locale === activeLocale}>
          {locale}
        </Link>
      ))}
    </nav>
  );
}
