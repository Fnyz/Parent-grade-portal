// One button that steps through Light, Dark and Auto (follow the device).
// A single button fits the narrow phone headers.

import { Monitor, Moon, Sun } from "lucide-react";
import { type Theme, setTheme, useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const NEXT: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
const NAME: Record<Theme, string> = { light: "Light", dark: "Dark", system: "Auto" };

export function ThemeToggle({ onDark, showLabel, className }: { onDark?: boolean; showLabel?: boolean; className?: string }) {
  const { theme } = useTheme();
  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const next = NEXT[theme];
  return (
    <Button
      type="button" variant="ghost" size={showLabel ? "sm" : "icon"}
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${NAME[theme]}. Switch to ${NAME[next]}.`}
      title={`Theme: ${NAME[theme]} (click for ${NAME[next]})`}
      className={cn("no-print size-10 rounded-xl", showLabel && "w-auto px-3",
        onDark && "hover:bg-ink-2 text-[#D6DEEC] hover:text-white", className)}
    >
      <Icon className="size-[18px]" />
      {showLabel && <span>{NAME[theme]}</span>}
    </Button>
  );
}
