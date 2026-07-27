import {
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@vng/design-system";
import type { NavItem } from "@vng/shared";
import { SmartLink } from "@/components/ui/smart-link";

/** One desktop `NavigationMenu` item — a plain link, or a trigger + dropdown when it has children. */
export function NavItemView({ item }: { item: NavItem }) {
  const href = item.page?.slug ? `/${item.page.slug}` : (item.url ?? "#");
  const children = item.children ?? [];

  if (children.length === 0) {
    return (
      <NavigationMenuItem>
        <NavigationMenuLink asChild className={navigationMenuTriggerStyle()}>
          <SmartLink href={href} target={item.target}>
            {item.label}
          </SmartLink>
        </NavigationMenuLink>
      </NavigationMenuItem>
    );
  }

  return (
    <NavigationMenuItem>
      <NavigationMenuTrigger>{item.label}</NavigationMenuTrigger>
      <NavigationMenuContent>
        <ul className="grid w-56 gap-1 p-3">
          {children.map((child) => (
            <li key={child.id}>
              <NavigationMenuLink asChild>
                <SmartLink
                  href={child.url ?? "#"}
                  target={child.target}
                  className="block rounded-md px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                >
                  {child.label}
                </SmartLink>
              </NavigationMenuLink>
            </li>
          ))}
        </ul>
      </NavigationMenuContent>
    </NavigationMenuItem>
  );
}
