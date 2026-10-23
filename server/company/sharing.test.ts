import { describe, expect, it } from "vitest";
import { type Folder, READ_ONLY, readersOf, sharePatches } from "./sharing";

const folders: Folder[] = [
  { id: "in", role: "inbox", shareWith: { anna: READ_ONLY, old: READ_ONLY } },
  { id: "sent", role: "sent", shareWith: { anna: READ_ONLY } },
];

describe("sharing", () => {
  it("reads the readers from the inbox", () => {
    expect(readersOf(folders)).toEqual(["anna", "old"]);
    expect(readersOf([])).toEqual([]);
  });

  it("adds new readers to every folder and removes those no longer wanted", () => {
    expect(sharePatches(folders, ["anna", "max"], READ_ONLY)).toEqual({
      in: { "shareWith/max": READ_ONLY, "shareWith/old": null },
      sent: { "shareWith/max": READ_ONLY },
    });
  });

  it("changes nothing when the readers stay", () => {
    expect(sharePatches(folders, ["anna", "old"], READ_ONLY)).toEqual({
      sent: { "shareWith/old": READ_ONLY },
    });
  });
});
