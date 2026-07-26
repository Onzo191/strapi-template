import type { LinkComponent } from "@vng/shared";
import { SmartLink } from "./smart-link";

const VARIANT_CLASS: Record<LinkComponent["variant"], string> = {
  primary: "vng-button vng-button--primary",
  secondary: "vng-button vng-button--secondary",
  outline: "vng-button vng-button--outline",
  link: "vng-button vng-button--link",
};

export function ActionLink({ action }: { action: LinkComponent }) {
  return (
    <SmartLink href={action.href} target={action.target} className={VARIANT_CLASS[action.variant]}>
      {action.label}
    </SmartLink>
  );
}
