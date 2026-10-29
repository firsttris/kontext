import { describe, expect, it } from "vitest";
import type { BodyPart } from "@/jmap/types";
import { savedBlobs, withSavedBlob } from "./draft-blobs";

const part = (blobId: string, cid: string | null, name = "x"): BodyPart => ({
  partId: blobId,
  blobId,
  type: "application/octet-stream",
  name,
  size: 1,
  cid,
  disposition: cid ? "inline" : "attachment",
});

describe("savedBlobs", () => {
  it("takes pictures by Content-ID and files in order from the draft just saved", () => {
    const map = savedBlobs(
      [{ blobId: "old-a" }, { blobId: "old-b" }],
      [{ blobId: "old-img", cid: "bild-1@kontext" }],
      [part("new-img", "<bild-1@kontext>"), part("new-a", null), part("new-b", null)],
    );
    expect(Object.fromEntries(map)).toEqual({
      "old-img": "new-img",
      "old-a": "new-a",
      "old-b": "new-b",
    });
  });

  it("leaves files alone when the draft holds another number of them", () => {
    expect(savedBlobs([{ blobId: "old-a" }], [], [])).toEqual(new Map());
  });

  it("gives an item its new blob and leaves the others", () => {
    const update = withSavedBlob<{ blobId: string; name: string }>(new Map([["a", "b"]]));
    expect(update({ blobId: "a", name: "x" })).toEqual({ blobId: "b", name: "x" });
    expect(update({ blobId: "c", name: "y" })).toEqual({ blobId: "c", name: "y" });
  });
});
