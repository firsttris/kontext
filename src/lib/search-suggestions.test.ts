import { beforeEach, describe, expect, it } from "vitest";
import { readRecent, rememberSearch, suggest } from "./search-suggestions";

const contacts = [
  { name: "Markus Hoffmann", email: "m.hoffmann@schreinerei.test" },
  { name: "Petra Keller", email: "petra@keller.test" },
];
const folders = ["Posteingang", "Gesendet", "Kunden/Hoffmann", "info@"];
const context = { contacts, folders, recent: ["angebot", "von:petra@keller.test"] };

describe("suggest", () => {
  it("shows the last searches for an empty box", () => {
    expect(suggest("", context).map((s) => s.value)).toEqual(["angebot", "von:petra@keller.test"]);
  });
  it("offers contacts after von: and an:", () => {
    expect(suggest("angebot von:hoff", context)).toEqual([
      {
        kind: "contact",
        label: "Markus Hoffmann",
        detail: "m.hoffmann@schreinerei.test",
        value: "angebot von:m.hoffmann@schreinerei.test ",
      },
    ]);
    expect(suggest("to:kel", context)[0]?.value).toBe("an:petra@keller.test ");
  });
  it("offers folders and mailboxes after in:", () => {
    expect(suggest("in:hoff", context).map((s) => s.value)).toEqual(["in:Kunden/Hoffmann "]);
    expect(suggest("in:info", context).map((s) => s.value)).toEqual(["in:info@ "]);
  });
  it("offers people and operators for a plain word", () => {
    const values = suggest("ke", context).map((s) => s.value);
    expect(values).toContain("von:petra@keller.test ");
    expect(suggest("ha", context).map((s) => s.value)).toContain("hat:anhang ");
    expect(suggest("ist", context).map((s) => s.value)).toEqual([
      "ist:ungelesen ",
      "ist:markiert ",
    ]);
  });
  it("is quiet after a space", () => {
    expect(suggest("angebot ", context)).toEqual([]);
  });
});

describe("recent searches", () => {
  beforeEach(() => localStorage.clear());
  it("keeps the newest first, without doubles, at most eight", () => {
    for (const q of ["a", "b", "a", "c", "d", "e", "f", "g", "h", "i"]) rememberSearch(q);
    expect(readRecent()).toEqual(["i", "h", "g", "f", "e", "d", "c", "a"]);
  });
});
