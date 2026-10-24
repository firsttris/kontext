import { describe, expect, it } from "vitest";
import { attachmentKind, extensionOf, hasThumbnail } from "./attachment-kind";

describe("attachmentKind", () => {
  it("knows images by type, PDFs by type, office files by extension", () => {
    expect(attachmentKind("image/jpeg", "Foto.JPG")).toBe("image");
    expect(attachmentKind("image/svg+xml", "Grundriss.svg")).toBe("image");
    expect(attachmentKind("application/pdf", "Angebot.pdf")).toBe("pdf");
    expect(attachmentKind("application/octet-stream", "Aufmaß.XLSX")).toBe("sheet");
    expect(attachmentKind("application/msword", "Brief.doc")).toBe("word");
    expect(attachmentKind("text/calendar", "einladung.ics")).toBe("calendar");
    expect(attachmentKind("text/plain", "notiz")).toBe("text");
    expect(attachmentKind("application/octet-stream", null)).toBe("other");
  });

  it("does not draw images the browser cannot show", () => {
    expect(attachmentKind("image/heic", "IMG_0001.HEIC")).toBe("other");
  });
});

describe("extensionOf", () => {
  it("is the lower-case ending, or nothing", () => {
    expect(extensionOf("Rechnung.2026.PDF")).toBe("pdf");
    expect(extensionOf("README")).toBe("");
    expect(extensionOf(null)).toBe("");
  });
});

describe("hasThumbnail", () => {
  it("only for images and PDFs below their limit", () => {
    expect(hasThumbnail("image", 2_000_000)).toBe(true);
    expect(hasThumbnail("image", 20 * 1024 * 1024)).toBe(false);
    expect(hasThumbnail("pdf", 24 * 1024 * 1024)).toBe(true);
    expect(hasThumbnail("word", 10)).toBe(false);
  });
});
