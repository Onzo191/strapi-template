import type { Global, Navigation } from "@vng/shared";
import { SmartLink } from "@/components/ui/smart-link";

export function Footer({
  navigation,
  global,
}: {
  navigation: Navigation | null;
  global: Global | null;
}) {
  const items = navigation?.items ?? [];
  const socialLinks = global?.socialLinks ?? [];

  return (
    <footer className="mt-24 border-t border-border">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <p className="text-sm text-muted-foreground">
            © {new Date().getUTCFullYear()} {global?.siteName ?? "VNG"}
          </p>
          {items.length > 0 && (
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {items.map((item) => (
                <li key={item.id}>
                  <SmartLink
                    href={item.url ?? "#"}
                    target={item.target}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {item.label}
                  </SmartLink>
                </li>
              ))}
            </ul>
          )}
          {socialLinks.length > 0 && (
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {socialLinks.map((link) => (
                <li key={link.id}>
                  <SmartLink
                    href={link.href}
                    target={link.target}
                    className="text-muted-foreground transition-colors hover:text-foreground"
                  >
                    {link.label}
                  </SmartLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </footer>
  );
}
