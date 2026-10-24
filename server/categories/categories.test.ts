import { describe, expect, it } from "vitest";
import { categoriesSchema, DEFAULT_CATEGORIES, keywordFor } from "./categories";

describe("keywordFor", () => {
  it("writes the name in plain letters, as IMAP allows", () => {
    expect(keywordFor("Wartet auf Rückmeldung!", [])).toBe("wartet-auf-rueckmeldung");
    expect(keywordFor("Größe & Maß", [])).toBe("groesse-mass");
    expect(keywordFor("Café", [])).toBe("cafe");
    expect(keywordFor("???", [])).toBe("kategorie");
  });

  it("is unique within the account", () => {
    expect(keywordFor("Erledigt", ["erledigt", "erledigt-2"])).toBe("erledigt-3");
  });
});

describe("categoriesSchema", () => {
  it("takes the defaults and refuses doubled keywords or bad ones", () => {
    expect(categoriesSchema.safeParse(DEFAULT_CATEGORIES).success).toBe(true);
    const twice = [DEFAULT_CATEGORIES[0], DEFAULT_CATEGORIES[0]];
    expect(categoriesSchema.safeParse(twice).success).toBe(false);
    const bad = [{ keyword: "$seen", name: "Gelesen", color: "red" }];
    expect(categoriesSchema.safeParse(bad).success).toBe(false);
  });
});
