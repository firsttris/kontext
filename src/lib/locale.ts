/**
 * The app's language: the one chosen in Einstellungen on this device, else the browser's, else
 * German (the Paraglide strategy in vite.config.ts). Paraglide's own localStorage strategy can't
 * tell "as the device" from a choice, it stores what it detected on the first call; so the choice
 * lives under a key of its own. Picked once per page load: a change reloads.
 */
import { defineCustomClientStrategy, getLocale, isLocale, type Locale } from "@/paraglide/runtime";

const KEY = "kontext.language";

/** The language chosen on this device, or undefined for "as the device". */
export const chosenLanguage = (): Locale | undefined => {
  try {
    const stored = localStorage.getItem(KEY);
    return stored && isLocale(stored) ? stored : undefined;
  } catch {
    return undefined; // Storage refused or none (server): the browser decides.
  }
};

// Read only: Paraglide's own calls to set the language (it echoes what it detected) are ignored.
defineCustomClientStrategy("custom-choice", { getLocale: chosenLanguage, setLocale: () => {} });

/** Keeps the choice (undefined: as the device) and loads the app again in that language. */
export const chooseLanguage = (locale: Locale | undefined) => {
  try {
    if (locale) localStorage.setItem(KEY, locale);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage refused: the browser's language stays.
  }
  window.location.reload();
};

/** English with the day before the month and the 24-hour clock: Kontext's users are in Europe. */
const TAGS = { de: "de-DE", en: "en-GB" } as const;

/** The language as a tag for dates, numbers and lists. */
export const LOCALE: string = TAGS[getLocale()];
