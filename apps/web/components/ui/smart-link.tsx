import { type ComponentPropsWithoutRef, forwardRef } from "react";
import { Link } from "@/i18n/navigation";

interface SmartLinkProps extends Omit<ComponentPropsWithoutRef<"a">, "href" | "target"> {
  href: string;
  target?: "_self" | "_blank";
}

/**
 * Internal hrefs go through next-intl's locale-aware `Link`; everything else
 * is a plain anchor. Forwards ref + arbitrary props (`...rest`) so it can be
 * used as the child of a Radix `asChild`/`Slot` consumer (nav dropdowns,
 * `SheetClose`) without losing focus handling or click behavior.
 */
export const SmartLink = forwardRef<HTMLAnchorElement, SmartLinkProps>(function SmartLink(
  { href, target, ...rest },
  ref,
) {
  const isExternal = /^(https?:)?\/\//.test(href);

  if (isExternal || target === "_blank") {
    return (
      <a ref={ref} href={href} target={target ?? "_blank"} rel="noopener noreferrer" {...rest} />
    );
  }

  return <Link ref={ref} href={href} {...rest} />;
});
