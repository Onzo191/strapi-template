import type { Global, Navigation } from "@vng/shared";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "./locale-switcher";
import { NavItemView } from "./nav-item";

export function Header({
  navigation,
  global,
}: {
  navigation: Navigation | null;
  global: Global | null;
}) {
  return (
    <header className="vng-header">
      <div className="vng-container vng-header__bar">
        <Link href="/" style={{ fontWeight: 700, fontSize: "1.25rem", textDecoration: "none" }}>
          {global?.siteName ?? "VNG"}
        </Link>
        {navigation?.items && navigation.items.length > 0 && (
          <ul className="vng-nav">
            {navigation.items.map((item) => (
              <NavItemView key={item.id} item={item} />
            ))}
          </ul>
        )}
        <LocaleSwitcher />
      </div>
    </header>
  );
}
