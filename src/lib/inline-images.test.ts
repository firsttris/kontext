import { describe, expect, it } from "vitest";
import { markCids, newCid, sendableHtml } from "./inline-images";

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
  it("marks a draft's cid: images, with or without angle brackets", () => {
    expect(markCids('<p><img src="cid:bild-1@kontext"><img src="cid:<b2@x>"></p>')).toBe(
      '<p><img src="cid:bild-1@kontext" data-cid="bild-1@kontext">' +
        '<img src="cid:<b2@x>" data-cid="b2@x"></p>',
    );
    expect(markCids("<p>ohne</p>")).toBe("<p>ohne</p>");
  });

  it("makes Content-IDs that are addresses", () => {
    expect(newCid("a1b2")).toBe("bild-a1b2@kontext");
  });
});
