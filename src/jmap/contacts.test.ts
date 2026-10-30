import { describe, expect, it } from "vitest";
import { contactPhoto } from "@/lib/jscontact";
import { type JmapClient, jmapError } from "./client";
import { listContacts } from "./contacts";

/**
 * Stalwart 1.0.1 as checked against a running server: ContactCard/get gives a stored photo as a
 * blobId (crates/jmap/src/contact/get.rs, EmbeddedBlobIds), Blob/get its bytes under another id.
 */
const JPEG = "/9j/4AAQSkZJRgABAQ==";
const stalwart = {
  call: async (method: string) => {
    if (method === "ContactCard/query") return { ids: ["c1", "c2"] };
    return {
      list: [
        { id: "c1", media: { p1: { kind: "photo", blobId: "b1", mediaType: "image/jpeg" } } },
        { id: "c2", media: { l1: { kind: "logo", uri: "https://example.test/logo.png" } } },
      ],
    };
  },
  request: async (calls: [string, Record<string, unknown>, string][]) =>
    calls.map(([, args, id]) => [
      "Blob/get",
      {
        list: (args.ids as string[]).map((blobId) => ({ id: `${blobId}x`, "data:asBase64": JPEG })),
        notFound: [],
      },
      id,
    ]),
} as unknown as JmapClient;

describe("listContacts", () => {
  it("brings a photo Stalwart 1.0 keeps as a blob back into the card", async () => {
    const [withPhoto, withLogo] = await listContacts(stalwart, "a", "book");
    expect(contactPhoto(withPhoto!)).toBe(`data:image/jpeg;base64,${JPEG}`);
    expect(withPhoto!.media!.p1).not.toHaveProperty("blobId");
    expect(withLogo!.media).toEqual({
      l1: { kind: "logo", uri: "https://example.test/logo.png" },
    });
  });

  it("still lists the cards of a shared book whose photos Blob/get refuses", async () => {
    // Stalwart 1.0.1, as checked against a running server: Blob/get in an account shared by a
    // colleague answers accountNotSupportedByMethod; the client throws on a method-level error.
    const shared = {
      ...stalwart,
      request: async () => {
        throw jmapError("The account does not support this method", "accountNotSupportedByMethod");
      },
    } as unknown as JmapClient;
    const cards = await listContacts(shared, "a", "book");
    expect(cards.map((card) => card.id)).toEqual(["c1", "c2"]);
    expect(contactPhoto(cards[0]!)).toBeUndefined();
  });
});
