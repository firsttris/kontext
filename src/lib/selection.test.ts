import { describe, expect, it } from "vitest";
import type { EmailSummary } from "@/jmap/types";
import {
  addRange,
  categoryState,
  groupsOf,
  keepListed,
  marksFlagged,
  marksRead,
  type Picked,
  pickKey,
  rowClick,
  singleAccount,
  toggleKey,
} from "./selection";

const email = (id: string, mailboxIds: string[], keywords: string[] = []) =>
  ({
    id,
    mailboxIds: Object.fromEntries(mailboxIds.map((box) => [box, true])),
    keywords: Object.fromEntries(keywords.map((keyword) => [keyword, true])),
  }) as unknown as EmailSummary;

describe("selection", () => {
  const order = ["a/1", "a/2", "a/3", "b/4"];

  it("toggles one and adds a range in list order, both ways", () => {
    expect([...toggleKey(new Set(["a/1"]), "a/1")]).toEqual([]);
    expect([...addRange(new Set(), order, "a/1", "a/3")]).toEqual(["a/1", "a/2", "a/3"]);
    expect([...addRange(new Set(["b/4"]), order, "b/4", "a/2")].sort()).toEqual([
      "a/2",
      "a/3",
      "b/4",
    ]);
    expect([...addRange(new Set(), order, undefined, "a/2")]).toEqual(["a/2"]);
  });

  it("forgets mails that left the list", () => {
    const selected = new Set(["a/1", "x/9"]);
    expect([...keepListed(selected, order)]).toEqual(["a/1"]);
    const same = new Set(["a/1"]);
    expect(keepListed(same, order)).toBe(same);
  });

  it("groups by account and the folder a mail is taken out of", () => {
    const picked: Picked[] = [
      { accountId: "a", email: email("1", ["inbox", "kunden"]) },
      { accountId: "a", email: email("2", ["kunden"]) },
      { accountId: "b", email: email("3", ["inbox-b"]) },
    ];
    expect(groupsOf(picked, "kunden").map((g) => [g.accountId, g.from, g.emails.length])).toEqual([
      ["a", "kunden", 2],
      ["b", "inbox-b", 1],
    ]);
    expect(groupsOf(picked).map((g) => g.from)).toEqual(["inbox", "kunden", "inbox-b"]);
    expect(pickKey("a", "1")).toBe("a/1");
    expect(singleAccount(picked)).toBeNull();
    expect(singleAccount(picked.slice(0, 2))).toBe("a");
  });

  it("decides read, flag and category for all from their state", () => {
    const read = { accountId: "a", email: email("1", ["x"], ["$seen", "$flagged", "erledigt"]) };
    const unread = { accountId: "a", email: email("2", ["x"]) };
    expect(marksRead([read, unread])).toBe(true);
    expect(marksRead([read])).toBe(false);
    expect(marksFlagged([read])).toBe(false);
    expect(marksFlagged([read, unread])).toBe(true);
    const done = { keyword: "erledigt", name: "Erledigt", color: "green" as const };
    expect(categoryState([read], done)).toBe("all");
    expect(categoryState([read, unread], done)).toBe("some");
    expect(categoryState([unread], done)).toBe("none");
  });

  it("picks on a click with Shift or Ctrl, and on a phone's tap while picking", () => {
    const click = { shift: false, ctrl: false, picking: false, phone: false };
    expect(rowClick(click)).toBe("open");
    expect(rowClick({ ...click, shift: true })).toBe("range");
    expect(rowClick({ ...click, ctrl: true })).toBe("toggle");
    expect(rowClick({ ...click, picking: true })).toBe("open");
    expect(rowClick({ ...click, phone: true })).toBe("open");
    expect(rowClick({ ...click, picking: true, phone: true })).toBe("toggle");
  });
});
