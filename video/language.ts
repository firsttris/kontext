import { readFileSync } from "node:fs";

/**
 * The film's language: FILM_LANG=en records the app in English and renders the English film,
 * anything else the German one. The app follows the browser's language (src/lib/locale.ts), the
 * takes find its controls by its own texts (messages/*.json), the stage says the film's words
 * (`say`). The seed of Weber Haustechnik stays German in both.
 */
export type Language = "de" | "en";

export const LANGUAGE: Language = process.env.FILM_LANG === "en" ? "en" : "de";

/** The browser's language in the takes; English as Kontext has it, with the European calendar. */
export const BROWSER_LOCALE = { de: "de-DE", en: "en-GB" }[LANGUAGE];

/** The film's own words, German and English side by side. */
export const say = (de: string, en: string) => (LANGUAGE === "en" ? en : de);

/** The film, its poster and the README's teaser in docs/assets, one set per language. */
export const assetsOf = (language: Language) => ({
  film: `kontext-film.${language}.mp4`,
  poster: `kontext-film.${language}.jpg`,
  teaser: `kontext-teaser.${language}.webp`,
});

let messages: Record<string, unknown> | undefined;

/** The app's texts in the film's language; read on first use, from the repository's root. */
const message = (key: string) => {
  messages ??= JSON.parse(readFileSync(`messages/${LANGUAGE}.json`, "utf8")) as Record<
    string,
    unknown
  >;
  const text = messages[key];
  if (typeof text !== "string") throw new Error(`No text "${key}" in messages/${LANGUAGE}.json`);
  return text;
};

/** A text of the app as it shows it, with its {params} filled in. */
export const ui = (key: string, params: Record<string, string> = {}) =>
  message(key).replace(/\{(\w+)\}/g, (_, name: string) => params[name] ?? `{${name}}`);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A text of the app with any value in its {params}, for names and lines that carry one. */
export const uiPattern = (key: string) =>
  new RegExp(
    message(key)
      .split(/\{\w+\}/)
      .map(escapeRegExp)
      .join(".*"),
  );
