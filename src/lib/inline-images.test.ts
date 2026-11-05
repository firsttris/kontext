import { describe, expect, it } from "vitest";
import { inlineParts, markCids, newCid, sendableHtml, shownCids } from "./inline-images";

describe("sendableHtml", () => {
  it("points each marked image to its Content-ID and lists them once", () => {
    const { html, cids } = sendableHtml(
      '<p>Baustelle:</p><img src="blob:http://x/1" data-cid="bild-1@kontext" width="300">' +
        '<p><img src="blob:http://x/1" data-cid="bild-1@kontext"></p>',
    );
    expect(html).toBe(
      '<p>Baustelle:</p><img src="cid:bild-1@kontext" width="300">' +
        '<p><img src="cid:bild-1@kontext"></p>',
    );
    expect(cids).toEqual(["bild-1@kontext"]);
  });

  it("leaves HTML without such images as it is", () => {
    const html = '<p>Hallo <img src="https://example.test/logo.png"></p>';
    expect(sendableHtml(html)).toEqual({ html, cids: [] });
  });
});

describe("markCids", () => {
  it("decodes a cid: URL to the Content-ID it names (RFC 2392 §2)", () => {
    expect(markCids('<img src="cid:logo%40keller.test">')).toBe(
      '<img src="cid:logo%40keller.test" data-cid="logo@keller.test">',
    );
  });
  it("marks a draft's cid: images, with or without angle brackets", () => {
    // Serialising escapes < and > in attribute values (HTML spec since 2025, parse5 8.1).
    expect(markCids('<p><img src="cid:bild-1@kontext"><img src="cid:<b2@x>"></p>')).toBe(
      '<p><img src="cid:bild-1@kontext" data-cid="bild-1@kontext">' +
        '<img src="cid:&lt;b2@x&gt;" data-cid="b2@x"></p>',
    );
    expect(markCids("<p>ohne</p>")).toBe("<p>ohne</p>");
  });

  it("makes Content-IDs that are addresses", () => {
    expect(newCid("a1b2")).toBe("bild-a1b2@kontext");
  });
});

describe("shownCids", () => {
  it("lists the Content-IDs the text shows, each once", () => {
    expect(
      shownCids(
        '<blockquote><img src="blob:x/1" data-cid="logo@keller.test"><img data-cid="logo@keller.test">' +
          '<img src="https://keller.test/a.png"></blockquote>',
      ),
    ).toEqual(["logo@keller.test"]);
    expect(shownCids("<p>ohne Bild</p>")).toEqual([]);
  });
});

describe("inlineParts", () => {
  const part = (cid: string | null, blobId: string | null) => ({
    partId: "1",
    blobId,
    type: "image/png",
    name: null,
    size: 1,
    cid,
    disposition: "inline",
  });
  it("keeps the parts with a Content-ID and a blob, from the attachments and the HTML body", () => {
    const parts = inlineParts({
      attachments: [part("<a@x>", "b1"), part(null, "b2"), part("<c@x>", null)],
      htmlBody: [part("<d@x>", "b4")],
    });
    expect(parts.map((p) => p.blobId)).toEqual(["b1", "b4"]);
  });
});
