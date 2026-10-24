import { describe, expect, it } from "vitest";
import { imapCategories, outlookColor, resolveCategories } from "./categories";

describe("outlookColor", () => {
  it("maps Outlook's presets on the app's colours", () => {
    expect(outlookColor("preset0")).toBe("red");
    expect(outlookColor("preset4")).toBe("green");
    expect(outlookColor("preset22")).toBe("blue");
    expect(outlookColor("none")).toBeUndefined();
    expect(outlookColor(undefined)).toBeUndefined();
  });
});

describe("imapCategories", () => {
  it("takes Thunderbird's tags and own keywords, not system flags", () => {
    expect(
      imapCategories(["\\Seen", "$label1", "$Forwarded", "Junk", "NonJunk", "angebot", "$MDNSent"]),
    ).toEqual([{ name: "Wichtig", color: "red" }, { name: "angebot" }]);
  });
});

describe("resolveCategories", () => {
  it("finds categories by name and adds missing ones with their colour", () => {
    const existing = [{ keyword: "erledigt", name: "Erledigt", color: "green" as const }];
    const { categories, keywords } = resolveCategories(existing, [
      { name: "erledigt" },
      { name: "Großkunde", color: "violet" },
      { name: "Rechnung" },
      { name: "Großkunde" },
    ]);
    expect(categories).toEqual([
      ...existing,
      { keyword: "grosskunde", name: "Großkunde", color: "violet" },
      { keyword: "rechnung", name: "Rechnung", color: "red" },
    ]);
    expect([...keywords]).toEqual([
      ["erledigt", "erledigt"],
      ["großkunde", "grosskunde"],
      ["rechnung", "rechnung"],
    ]);
  });
});
