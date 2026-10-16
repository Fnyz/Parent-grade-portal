// Light, dark, or following the device ("system"). Light is the default: it is
// the approved design. The choice is kept per device; public/theme.js applies
// it before the page paints. One shared value, so every switch and the toasts
// stay in step.

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark" | "system";
const KEY = "pgp-theme";
const media = () => window.matchMedia("(prefers-color-scheme: dark)");

function read(): Theme {
  try {
    const t = localStorage.getItem(KEY);
    return t === "dark" || t === "system" ? t : "light";
  } catch {
    return "light";
  }
}

let theme: Theme = read();
const listeners = new Set<() => void>();

const isDark = () => theme === "dark" || (theme === "system" && media().matches);

function apply() {
  document.documentElement.classList.toggle("dark", isDark());
  listeners.forEach((l) => l());
}

export function setTheme(t: Theme) {
  theme = t;
  try { localStorage.setItem(KEY, t); } catch { /* remembered for this visit only */ }
  apply();
}

media().addEventListener("change", () => { if (theme === "system") apply(); });

// Report cards and access slips always print light.
window.addEventListener("beforeprint", () => document.documentElement.classList.remove("dark"));
window.addEventListener("afterprint", apply);

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** The chosen theme and whether the page is dark right now. */
export function useTheme(): { theme: Theme; dark: boolean } {
  const t = useSyncExternalStore(subscribe, () => theme);
  const dark = useSyncExternalStore(subscribe, isDark);
  return { theme: t, dark };
}
