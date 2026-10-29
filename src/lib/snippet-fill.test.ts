import { describe, expect, it } from "vitest";
import { textToHtml } from "./html";
import { fillSnippet, type SnippetContext, snippetFields } from "./snippet-fill";

const context: SnippetContext = {
  recipient: "Markus Hoffmann",
  sender: "Jonas Weber",
  today: new Date(2026, 9, 29, 9, 30),
  locale: "de-DE",
};

describe("fillSnippet", () => {
  it("puts in the recipient's name as before, or nothing", () => {
    expect(fillSnippet("Hallo {Vorname}, Herr {Name}", context)).toBe(
      "Hallo Markus, Herr Markus Hoffmann",
    );
    expect(fillSnippet("Guten Tag {Name},", { ...context, recipient: "" })).toBe("Guten Tag ,");
  });

  it("puts in today's date in the language and one's own name", () => {
    expect(fillSnippet("Stand {Datum}, {Absender}", context)).toBe("Stand 29.10.2026, Jonas Weber");
    expect(fillSnippet("{Datum}", { ...context, locale: "en-GB" })).toBe("29 Oct 2026");
  });

  it("reads the known placeholders in any case", () => {
    expect(fillSnippet("{datum} {NAME}", context)).toBe("29.10.2026 Markus Hoffmann");
  });

  it("fills own fields from the answers, unanswered ones stay visible", () => {
    expect(
      fillSnippet("Auftrag {Auftragsnummer} am {Termin am}, {Monteur}", context, {
        Auftragsnummer: "A-4711",
        "Termin am": "Dienstag",
      }),
    ).toBe("Auftrag A-4711 am Dienstag, {Monteur}");
  });

  it("escapes every value and keeps the HTML around it", () => {
    const html = textToHtml("Guten Tag {Name},\n\nAuftrag: {Nr}\nhttps://weber.test/a/{Nr}");
    expect(fillSnippet(html, { ...context, recipient: "Tom & <Jerry>" }, { Nr: 'x"1' })).toBe(
      "<p>Guten Tag Tom &amp; &lt;Jerry&gt;,</p>" +
        '<p>Auftrag: x&quot;1<br><a href="https://weber.test/a/x&quot;1">https://weber.test/a/x&quot;1</a></p>',
    );
    expect(fillSnippet("<p><strong>{Nr}</strong></p>", context, { Nr: "<b>" })).toBe(
      "<p><strong>&lt;b&gt;</strong></p>",
    );
  });

  it("leaves braces alone that are no placeholder", () => {
    expect(fillSnippet("{ } {1a} {constructor} {}", context)).toBe("{ } {1a} {constructor} {}");
  });
});

describe("snippetFields", () => {
  it("lists the own fields once, in order, without Kontext's own", () => {
    expect(
      snippetFields(
        "{Name}: {Auftragsnummer} vom {Datum}, {Termin am} – {Auftragsnummer} {absender}",
      ),
    ).toEqual(["Auftragsnummer", "Termin am"]);
  });

  it("finds none in a snippet without own fields", () => {
    expect(snippetFields("Guten Tag {Vorname},\n\nbis {Datum}.")).toEqual([]);
  });
});
