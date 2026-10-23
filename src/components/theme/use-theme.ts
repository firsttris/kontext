/** The theme for the whole app: the stored choice, the device setting, and the class on <html>. */
import { useEffect, useSyncExternalStore } from "react";
import { parseTheme, resolveTheme, THEME_KEY, type ThemeChoice } from "@/lib/theme";

const media = () => window.matchMedia("(prefers-color-scheme: dark)");

const readChoice = (): ThemeChoice => {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY));
  } catch {
    return "system";
  }
};

let choice = readChoice();
const listeners = new Set<() => void>();
const notify = () => {
  for (const listener of listeners) listener();
};

export const setThemeChoice = (next: ThemeChoice): void => {
  choice = next;
  try {
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage may be refused (private window); the choice then lasts until reload.
  }
  notify();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const query = media();
  query.addEventListener("change", listener);
  return () => {
    listeners.delete(listener);
    query.removeEventListener("change", listener);
  };
};

/** The user's choice and what is shown now. */
export const useTheme = () => {
  const current = useSyncExternalStore(subscribe, () => choice);
  const systemDark = useSyncExternalStore(subscribe, () => media().matches);
  return { choice: current, theme: resolveTheme(current, systemDark) };
};

/** Keeps the class on <html> in step; mounted once at the root. */
export const useApplyTheme = (): void => {
  const { theme } = useTheme();
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    root.classList.toggle("light", theme === "light");
    for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'))
      meta.content = theme === "dark" ? "#09090b" : "#ffffff";
  }, [theme]);
};
