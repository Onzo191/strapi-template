import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

interface SmartLinkProps {
  href: string;
  target?: "_self" | "_blank";
  className?: string;
  children: ReactNode;
}

/** Internal hrefs go through next-intl's locale-aware `Link`; everything else is a plain anchor. */
export function SmartLink({ href, target, className, children }: SmartLinkProps) {
  const isExternal = /^(https?:)?\/\//.test(href);

  if (isExternal || target === "_blank") {
    return (
      <a href={href} className={className} target={target ?? "_blank"} rel="noopener noreferrer">
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}
