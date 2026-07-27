"use client";

import { cn } from "@vng/design-system";
import { useLocale } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

/** Locale toggle — a client island (needs the current pathname). */
export function LocaleSwitcher() {
  const pathname = usePathname();
  const activeLocale = useLocale();

  return (
    <nav aria-label="Language" className="flex items-center gap-1 text-sm font-semibold">
      {routing.locales.map((locale) => (
        <Link
          key={locale}
          href={pathname}
          locale={locale}
          aria-current={locale === activeLocale}
          className={cn(
            "rounded-md px-2 py-1 uppercase transition-colors hover:bg-accent hover:text-accent-foreground",
            locale === activeLocale ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {locale}
        </Link>
      ))}
    </nav>
  );
}
