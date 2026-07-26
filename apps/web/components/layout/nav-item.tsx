import type { NavItem } from "@vng/shared";
import { SmartLink } from "@/components/ui/smart-link";

export function NavItemView({ item }: { item: NavItem }) {
  const href = item.page?.slug ? `/${item.page.slug}` : (item.url ?? "#");
  const hasChildren = item.children && item.children.length > 0;

  return (
    <li className="vng-nav-item">
      <SmartLink href={href} target={item.target} className="vng-nav-item__label">
        {item.label}
      </SmartLink>
      {hasChildren && (
        <ul className="vng-nav-item__dropdown">
          {item.children?.map((child) => (
            <li key={child.id}>
              <SmartLink href={child.url ?? "#"} target={child.target}>
                {child.label}
              </SmartLink>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
