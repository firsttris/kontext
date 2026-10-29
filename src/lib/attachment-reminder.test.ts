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
