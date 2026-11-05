import { describe, expect, it } from "vitest";
import { createUndoSlot, reverseMove, stillMoved } from "./undo-move";

describe("reverseMove", () => {
  it("swaps the folders of an archive or trash move", () => {
    expect(reverseMove({ accountId: "a", ids: ["1", "2"], from: "inbox", to: "archive" })).toEqual({
      accountId: "a",
      ids: ["1", "2"],
      from: "archive",
      to: "inbox",
      keywords: undefined,
    });
  });

  it("turns the spam keywords the other way", () => {
    const back = reverseMove({
      accountId: "a",
      ids: ["1"],
      from: "inbox",
      to: "junk",
      keywords: { $junk: true, $notjunk: null },
    });
    expect(back).toMatchObject({ from: "junk", to: "inbox" });
    expect(back.keywords).toEqual({ $junk: null, $notjunk: true });
  });
});

describe("stillMoved", () => {
  it("keeps only the mails still in the folder the move put them in", () => {
    const move = { accountId: "a", ids: ["1", "2", "3"], from: "inbox", to: "archive" };
    const now: { id: string; mailboxIds: Record<string, boolean> }[] = [
      { id: "1", mailboxIds: { archive: true } },
      { id: "2", mailboxIds: { trash: true } },
    ];
    expect(stillMoved(move, now)).toEqual({ ...move, ids: ["1"] });
  });
});

describe("createUndoSlot", () => {
  it("hands out the last undo once", () => {
    const slot = createUndoSlot<string>();
    slot.set("first");
    slot.set("second");
    expect(slot.take()).toBe("second");
    expect(slot.take()).toBeUndefined();
  });

  it("drops an undo only while it is the last one", () => {
    const slot = createUndoSlot<string>();
    slot.set("first");
    slot.set("second");
    slot.drop("first");
    expect(slot.take()).toBe("second");
    slot.set("third");
    slot.drop("third");
    expect(slot.take()).toBeUndefined();
  });
});
