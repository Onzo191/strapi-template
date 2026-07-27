"use client";

import { Contrast, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { THEMES, type ThemeName } from "./theme-provider";

const ICONS: Record<ThemeName, typeof Sun> = { light: Sun, dark: Moon, contrast: Contrast };
const LABELS: Record<ThemeName, string> = {
  light: "Light",
  dark: "Dark",
  contrast: "High contrast",
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  // Avoid a hydration mismatch: the resolved theme is only known client-side
  // after next-themes reads localStorage/system preference.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const active = (mounted ? theme : "light") as ThemeName;
  const ActiveIcon = ICONS[active] ?? Sun;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme">
          <ActiveIcon className="size-5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {THEMES.map((name) => {
          const Icon = ICONS[name];
          return (
            <DropdownMenuItem key={name} onSelect={() => setTheme(name)}>
              <Icon className="size-4" />
              {LABELS[name]}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
