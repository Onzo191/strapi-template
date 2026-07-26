import type { Global, Navigation } from "@vng/shared";
import { SmartLink } from "@/components/ui/smart-link";

export function Footer({
  navigation,
  global,
}: {
  navigation: Navigation | null;
  global: Global | null;
}) {
  return (
    <footer className="vng-footer">
      <div className="vng-container vng-footer__bar">
        <p style={{ margin: 0 }}>
          © {new Date().getUTCFullYear()} {global?.siteName ?? "VNG"}
        </p>
        {navigation?.items && navigation.items.length > 0 && (
          <ul style={{ display: "flex", gap: "1.25rem", listStyle: "none", margin: 0, padding: 0 }}>
            {navigation.items.map((item) => (
              <li key={item.id}>
                <SmartLink href={item.url ?? "#"} target={item.target}>
                  {item.label}
                </SmartLink>
              </li>
            ))}
          </ul>
        )}
        {global?.socialLinks && global.socialLinks.length > 0 && (
          <ul style={{ display: "flex", gap: "1.25rem", listStyle: "none", margin: 0, padding: 0 }}>
            {global.socialLinks.map((link) => (
              <li key={link.id}>
                <SmartLink href={link.href} target={link.target}>
                  {link.label}
                </SmartLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </footer>
  );
}
