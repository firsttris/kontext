import { describe, expect, it } from "vitest";
import type { Mailbox } from "@/jmap/types";
import {
  flattenTree,
  folderTree,
  mailboxName,
  mailboxPath,
  mailboxRights,
  systemMailboxes,
} from "./mailboxes";

const box = (
  id: string,
  name: string,
  role: string | null = null,
  parentId: string | null = null,
): Mailbox => ({
  id,
  name,
  role,
  parentId,
  sortOrder: 0,
  totalEmails: 0,
  unreadEmails: 0,
});

const mailboxes = [
  box("t", "Deleted Items", "trash"),
  box("i", "Inbox", "inbox"),
  box("s", "Sent Items", "sent"),
  box("k", "Kunden"),
  box("h", "Hoffmann", null, "k"),
  box("a", "Archiv", "archive"),
  box("b", "Buchhaltung"),
  box("e", "Keller Elektro", null, "k"),
];

describe("mailboxName", () => {
  it("names standard folders in German by role", () => {
    expect(mailboxName(box("i", "Inbox", "inbox"))).toBe("Posteingang");
    expect(mailboxName(box("t", "Deleted Items", "trash"))).toBe("Papierkorb");
  });
  it("keeps the name of own folders", () => {
    expect(mailboxName(box("k", "Kunden"))).toBe("Kunden");
  });
});

describe("systemMailboxes", () => {
  it("orders the standard folders like the sidebar", () => {
    expect(systemMailboxes(mailboxes).map((m) => m.id)).toEqual(["i", "s", "a", "t"]);
  });
});

describe("folderTree", () => {
  it("builds the tree of own folders sorted by name", () => {
    const tree = folderTree(mailboxes);
    expect(tree.map((n) => n.mailbox.name)).toEqual(["Buchhaltung", "Kunden"]);
    expect(tree[1]!.children.map((n) => n.mailbox.name)).toEqual(["Hoffmann", "Keller Elektro"]);
    expect(flattenTree(tree).map((n) => [n.mailbox.name, n.depth])).toEqual([
      ["Buchhaltung", 0],
      ["Kunden", 0],
      ["Hoffmann", 1],
      ["Keller Elektro", 1],
    ]);
  });
  it("shows a folder whose parent is a standard folder at the top level", () => {
    const tree = folderTree([box("i", "Inbox", "inbox"), box("x", "Projekte", null, "i")]);
    expect(tree.map((n) => n.mailbox.name)).toEqual(["Projekte"]);
  });
});

describe("mailboxPath", () => {
  it("joins the names from the top", () => {
    expect(mailboxPath(mailboxes.find((m) => m.id === "h")!, mailboxes)).toBe("Kunden / Hoffmann");
  });
});

describe("mailboxRights", () => {
  it("allows everything when the server says nothing", () => {
    expect(mailboxRights({ id: "a" } as Mailbox)).toEqual({
      canRemove: true,
      canMarkSeen: true,
      canFlag: true,
    });
  });
  it("follows a mailbox shared only for reading", () => {
    expect(
      mailboxRights({
        id: "a",
        myRights: {
          mayReadItems: true,
          mayRemoveItems: false,
          maySetSeen: true,
          maySetKeywords: false,
        },
      } as Mailbox),
    ).toEqual({ canRemove: false, canMarkSeen: true, canFlag: false });
  });
});
