import { describe, expect, it } from "vitest";
import { bodyStructureOf } from "./mail-structure";

const file = { blobId: "b1", name: "Angebot.pdf", type: "application/pdf" };
const image = { blobId: "b2", name: "foto.png", type: "image/png", cid: "bild-1@kontext" };

describe("bodyStructureOf", () => {
  it("is text and HTML as alternatives without files", () => {
    expect(bodyStructureOf([])).toEqual({
      type: "multipart/alternative",
      subParts: [
        { partId: "text", type: "text/plain" },
        { partId: "html", type: "text/html" },
      ],
    });
  });

  it("puts the images with the HTML in multipart/related, the files after it", () => {
    expect(bodyStructureOf([file], [image])).toEqual({
      type: "multipart/mixed",
      subParts: [
        {
          type: "multipart/alternative",
          subParts: [
            { partId: "text", type: "text/plain" },
            {
              type: "multipart/related",
              subParts: [
                { partId: "html", type: "text/html" },
                { ...image, disposition: "inline" },
              ],
            },
          ],
        },
        { ...file, disposition: "attachment" },
      ],
    });
  });
});
