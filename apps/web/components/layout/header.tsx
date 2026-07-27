"use client";

import {
  Button,
  NavigationMenu,
  NavigationMenuList,
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
  ThemeToggle,
} from "@vng/design-system";
import type { Global, NavItem, Navigation } from "@vng/shared";
import { ChevronDown, Menu } from "lucide-react";
import { useState } from "react";
import { SmartLink } from "@/components/ui/smart-link";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { NavItemView } from "./nav-item";

function MobileNavItem({ item }: { item: NavItem }) {
  const href = item.page?.slug ? `/${item.page.slug}` : (item.url ?? "#");
  const children = item.children ?? [];

  if (children.length === 0) {
    return (
      <SheetClose asChild>
        <SmartLink
          href={href}
          target={item.target}
          className="block rounded-md px-3 py-2 text-base font-medium hover:bg-accent hover:text-accent-foreground"
        >
          {item.label}
        </SmartLink>
      </SheetClose>
    );
  }

  return (
    <details className="group rounded-md px-3 py-2">
      <summary className="flex cursor-pointer list-none items-center justify-between text-base font-medium">
        {item.label}
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" />
      </summary>
      <div className="mt-1 flex flex-col gap-1 pl-3">
        {children.map((child) => (
          <SheetClose key={child.id} asChild>
            <SmartLink
              href={child.url ?? "#"}
              target={child.target}
              className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            >
              {child.label}
            </SmartLink>
          </SheetClose>
        ))}
      </div>
    </details>
  );
}

export function Header({
  navigation,
  global,
}: {
  navigation: Navigation | null;
  global: Global | null;
}) {
  const [open, setOpen] = useState(false);
  const items = navigation?.items ?? [];

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          {global?.siteName ?? "VNG"}
        </Link>

        {items.length > 0 && (
          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              {items.map((item) => (
                <NavItemView key={item.id} item={item} />
              ))}
            </NavigationMenuList>
          </NavigationMenu>
        )}

        <div className="hidden items-center gap-2 md:flex">
          <LocaleSwitcher />
          <ThemeToggle />
        </div>

        <div className="flex items-center gap-1 md:hidden">
          <ThemeToggle />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <nav className="flex flex-col gap-1">
                {items.map((item) => (
                  <MobileNavItem key={item.id} item={item} />
                ))}
              </nav>
              <div className="mt-auto pt-4">
                <LocaleSwitcher />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
