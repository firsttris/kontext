import { describe, expect, it } from "vitest";
import {
  fitsEncrypted,
  HELD_LIMIT,
  heldId,
  isHeld,
  pullIntoBrowser,
  releaseHeld,
} from "./held-files";

const held = { blobId: heldId("a1"), size: 10 };
const stored = { blobId: "Bstalwart", size: 20 };

describe("held files", () => {
  it("tells a file kept in the browser from one in Stalwart", () => {
    expect(isHeld(held.blobId)).toBe(true);
    expect(isHeld(stored.blobId)).toBe(false);
  });

  it("allows files up to the limit together", () => {
    expect(fitsEncrypted([HELD_LIMIT - 1, 1])).toBe(true);
    expect(fitsEncrypted([HELD_LIMIT, 1])).toBe(false);
    expect(fitsEncrypted([])).toBe(true);
  });

  it("uploads only the held files, each once, when the mail goes unencrypted", async () => {
    const uploaded: string[] = [];
    const map = await releaseHeld([held, stored, held], async (id) => {
      uploaded.push(id);
      return `B-${id}`;
    });
    expect(uploaded).toEqual([held.blobId]);
    expect(Object.fromEntries(map)).toEqual({ [held.blobId]: `B-${held.blobId}` });
  });

  it("pulls only the files in Stalwart into the browser when encrypting is switched on", async () => {
    const map = await pullIntoBrowser([held, stored], async (blobId) => heldId(blobId));
    expect(Object.fromEntries(map)).toEqual({ Bstalwart: "held:Bstalwart" });
  });

  it("stops at the first failure, so nothing goes out half moved", async () => {
    await expect(
      releaseHeld([held], async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
  });
});
