import { safeHref } from "@vng/shared";
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
 *
 * **Every** CMS-authored href reaches the DOM through here (nav items, `link`
 * components, CTAs), so this is where scheme safety is enforced: `safeHref`
 * rejects `javascript:`/`data:`/`vbscript:` so an editor cannot turn a link into
 * stored XSS. A rejected href degrades to a non-navigating `<span>` rather than
 * an `<a href="#">` — a dead anchor that still looks clickable is worse for both
 * the reader and the editor debugging their own typo.
 */
export const SmartLink = forwardRef<HTMLAnchorElement, SmartLinkProps>(function SmartLink(
  { href, target, ...rest },
  ref,
) {
  const safe = safeHref(href);

  if (!safe) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[SmartLink] refusing to render unsafe href: ${JSON.stringify(href)}`);
    }
    const { children, className } = rest;
    return (
      <span className={className} data-unsafe-href="true">
        {children}
      </span>
    );
  }

  const isExternal = /^(https?:)?\/\//.test(safe);

  if (isExternal || target === "_blank") {
    return (
      <a ref={ref} href={safe} target={target ?? "_blank"} rel="noopener noreferrer" {...rest} />
    );
  }

  return <Link ref={ref} href={safe} {...rest} />;
});
