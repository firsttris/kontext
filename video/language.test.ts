import { describe, expect, it } from "vitest";
import { assetsOf, say, ui, uiPattern } from "./language";

// Without FILM_LANG the film is German.
describe("the film's language", () => {
  it("says the German words", () => {
    expect(say("Posteingang", "Inbox")).toBe("Posteingang");
  });

  it("finds the app's texts and fills in their params", () => {
    expect(ui("mail_inbox")).toBe("Posteingang");
    expect(ui("phone_incoming", { name: "Petra Keller" })).toBe("Anruf von Petra Keller");
  });

  it("matches a text of the app with any value in its params", () => {
    expect(uiPattern("call_panel").test("Gespräch: Anna Weber")).toBe(true);
    expect(uiPattern("documents_saved").test("„a.pdf“ liegt jetzt in Dokumente.")).toBe(true);
    expect(uiPattern("call_panel").test("Telefonat: Anna Weber")).toBe(false);
  });

  it("names a text the app does not have", () => {
    expect(() => ui("no_such_text")).toThrow(/no_such_text/);
  });

  it("keeps each language's film apart", () => {
    expect(assetsOf("en")).toEqual({
      film: "kontext-film.en.mp4",
      poster: "kontext-film.en.jpg",
      teaser: "kontext-teaser.en.webp",
    });
  });
});
