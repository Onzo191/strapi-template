/** Shared `background` variant → Tailwind classes for the Hero/CTA blocks (§4.2). */
export const SECTION_BACKGROUND: Record<"default" | "muted" | "dark" | "gradient", string> = {
  default: "bg-background text-foreground",
  muted: "bg-muted text-foreground",
  dark: "bg-foreground text-background",
  gradient: "bg-gradient-to-br from-primary to-foreground text-primary-foreground",
};
