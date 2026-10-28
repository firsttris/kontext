// Every language has every text, with the same placeholders as the German one.
import { describe, expect, test } from "vitest";
import settings from "../project.inlang/settings.json";

const load = async (locale: string): Promise<Record<string, string>> =>
  (await import(`../messages/${locale}.json`)).default;

const placeholders = (text: string) =>
  [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();

describe.each(settings.locales.filter((locale) => locale !== settings.baseLocale))(
  "%s",
  (locale) => {
    test("has the base language's texts and placeholders", async () => {
      const [base, other] = await Promise.all([load(settings.baseLocale), load(locale)]);
      expect(Object.keys(other).sort()).toEqual(Object.keys(base).sort());
      for (const [key, text] of Object.entries(base)) {
        expect(placeholders(other[key] ?? ""), key).toEqual(placeholders(text));
      }
    });
  },
);
