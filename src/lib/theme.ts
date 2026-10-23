/**
 * Light or dark: the user's choice ("system" follows the device). The choice is kept per device
 * in the browser; `index.html` applies it before the first paint, so nothing flashes.
 */
export type ThemeChoice = "system" | "light" | "dark";

export const THEME_KEY = "sekretaer.theme";

export const parseTheme = (value: string | null | undefined): ThemeChoice =>
  value === "light" || value === "dark" ? value : "system";

export const resolveTheme = (choice: ThemeChoice, systemDark: boolean): "light" | "dark" =>
  choice === "system" ? (systemDark ? "dark" : "light") : choice;
