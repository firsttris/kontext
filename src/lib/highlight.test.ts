import { describe, expect, it } from "vitest";
import { splitHighlight } from "./highlight";

describe("splitHighlight", () => {
  it("marks the words, ignoring case", () => {
    expect(splitHighlight("Angebot Wartungsvertrag 2027", ["wartung"])).toEqual([
      { text: "Angebot ", hit: false },
      { text: "Wartung", hit: true },
      { text: "svertrag 2027", hit: false },
    ]);
  });
  it("handles several words and special characters", () => {
    expect(splitHighlight("Re: (Bad) Angebot", ["(bad)", "angebot"]).filter((p) => p.hit)).toEqual([
      { text: "(Bad)", hit: true },
      { text: "Angebot", hit: true },
    ]);
    expect(splitHighlight("Hallo", [])).toEqual([{ text: "Hallo", hit: false }]);
  });
});
