import { describe, expect, it } from "vitest";
import { emptyFolderPlan } from "./empty-folder";

describe("emptyFolderPlan", () => {
  it("destroys what is only in the folder and takes the rest out of it", () => {
    expect(
      emptyFolderPlan(
        [
          { id: "a", mailboxIds: { trash: true } },
          { id: "b", mailboxIds: { trash: true, kunden: true } },
          { id: "c", mailboxIds: { trash: true, old: false } },
        ],
        "trash",
      ),
    ).toEqual({ destroy: ["a", "c"], unlink: ["b"] });
  });

  it("has nothing to do for an empty folder", () => {
    expect(emptyFolderPlan([], "trash")).toEqual({ destroy: [], unlink: [] });
  });
});
