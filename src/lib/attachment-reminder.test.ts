import { describe, expect, it } from "vitest";
import { attachmentMention } from "./attachment-reminder";

describe("attachmentMention", () => {
  it("finds what people write when something is attached", () => {
    expect(attachmentMention("", "Das Angebot finden Sie im Anhang.")).toBe("Anhang");
    expect(attachmentMention("", "anbei die Pläne")).toBe("anbei");
    expect(attachmentMention("", "Die Rechnung ist angehängt.")).toBe("angehängt");
    expect(attachmentMention("", "Beigefügt: der Lieferschein")).toBe("Beigefügt");
    expect(attachmentMention("", "Please find the offer attached.")).toBe("attached");
    expect(attachmentMention("", "See the attachment.")).toBe("attachment");
    expect(attachmentMention("Anhänge zum Auftrag", "")).toBe("Anhänge");
  });

  it("does not take words that only contain it", () => {
    expect(attachmentMention("", "Der Anhänger steht im Hof.")).toBeUndefined();
    expect(attachmentMention("", "Wir hängen das Bild auf.")).toBeUndefined();
    expect(attachmentMention("Termin am Freitag", "Bis dann!")).toBeUndefined();
  });
});

describe("attachmentMention: the forms people write", () => {
  it("finds the inflected and other common forms", () => {
    expect(attachmentMention("", "Ein angehängtes PDF zeigt den Plan.")).toBe("angehängtes");
    expect(attachmentMention("", "Im beigefügten Schreiben und beigefügtes Foto.")).toBe(
      "beigefügten",
    );
    expect(attachmentMention("", "Ein beigefügtes Foto zeigt den Schaden.")).toBe("beigefügtes");
    expect(attachmentMention("", "Anliegend erhalten Sie die Rechnung.")).toBe("Anliegend");
    expect(attachmentMention("", "I'm attaching the invoice.")).toBe("attaching");
  });
});

describe("attachmentMention: a subject taken over from the answered mail", () => {
  it("does not ask for every reply or forward to a mail whose subject named an attachment", () => {
    expect(attachmentMention("AW: Rechnung im Anhang", "Danke, ist angekommen.")).toBeUndefined();
    expect(attachmentMention("Re: Angebot anbei", "Passt so.")).toBeUndefined();
    expect(attachmentMention("Fwd: Pläne anbei", "Zur Info.")).toBeUndefined();
  });
});
