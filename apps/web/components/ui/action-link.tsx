import { buttonVariants, cn } from "@vng/design-system";
import type { LinkComponent } from "@vng/shared";
import { ExternalLink } from "lucide-react";
import { SmartLink } from "./smart-link";

const VARIANT: Record<LinkComponent["variant"], "default" | "secondary" | "outline" | "link"> = {
  primary: "default",
  secondary: "secondary",
  outline: "outline",
  link: "link",
};

export function ActionLink({ action }: { action: LinkComponent }) {
  return (
    <SmartLink
      href={action.href}
      target={action.target}
      className={cn(buttonVariants({ variant: VARIANT[action.variant] }))}
    >
      {action.label}
      {action.target === "_blank" && <ExternalLink aria-hidden="true" />}
    </SmartLink>
  );
}
