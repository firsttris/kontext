import { describe, expect, it } from "vitest";
import type { Mailbox } from "@/jmap/types";
import {
  canAssignIn,
  flattenTree,
  folderActions,
  folderTree,
  mailboxName,
  mailboxPath,
  mailboxRights,
  moveTargets,
  subfolders,
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

describe("canAssignIn", () => {
  it("needs maySetMetadata, which reading with keywords does not give", () => {
    expect(canAssignIn({ id: "a" } as Mailbox)).toBe(true);
    expect(
      canAssignIn({
        id: "a",
        myRights: { mayReadItems: true, maySetKeywords: true, maySetMetadata: false },
      } as Mailbox),
    ).toBe(false);
  });
});

describe("folder management", () => {
  const nested = [...mailboxes, box("x", "Rechnungen", null, "h")];
  const names = (list: { name: string }[]) => list.map((entry) => entry.name);

  it("lists a folder's subfolders at every depth, parents first", () => {
    expect(names(subfolders(box("k", "Kunden"), nested))).toEqual([
      "Hoffmann",
      "Rechnungen",
      "Keller Elektro",
    ]);
    expect(subfolders(box("b", "Buchhaltung"), nested)).toEqual([]);
  });

  it("offers every own folder as a move target except the folder and its subfolders", () => {
    const targets = moveTargets(box("h", "Hoffmann", null, "k"), nested);
    expect(names(targets.map((node) => node.mailbox))).toEqual([
      "Buchhaltung",
      "Kunden",
      "Keller Elektro",
    ]);
  });

  it("leaves out folders that take no subfolders", () => {
    const closed = { ...box("b", "Buchhaltung"), myRights: { mayCreateChild: false } };
    const targets = moveTargets(
      box("h", "Hoffmann", null, "k"),
      nested.map((entry) => (entry.id === "b" ? closed : entry)),
    );
    expect(names(targets.map((node) => node.mailbox))).not.toContain("Buchhaltung");
  });

  it("keeps the current parent, first when it is a standard folder", () => {
    const underInbox = box("p", "Projekte", null, "i");
    const targets = moveTargets(underInbox, [...nested, underInbox]);
    expect(names(targets.map((node) => node.mailbox))[0]).toBe("Inbox");

    const closed = { ...box("k", "Kunden"), myRights: { mayCreateChild: false } };
    const kept = moveTargets(
      box("h", "Hoffmann", null, "k"),
      nested.map((entry) => (entry.id === "k" ? closed : entry)),
    );
    expect(names(kept.map((node) => node.mailbox))).toContain("Kunden");
  });

  it("lets standard folders only be marked read, and only with unread mails", () => {
    expect(folderActions({ ...box("i", "Inbox", "inbox"), unreadEmails: 3 })).toEqual({
      rename: false,
      remove: false,
      markRead: true,
    });
    expect(folderActions(box("i", "Inbox", "inbox")).markRead).toBe(false);
    expect(folderActions(box("k", "Kunden"))).toEqual({
      rename: true,
      remove: true,
      markRead: false,
    });
  });

  it("offers no delete for a folder that holds a standard folder, which would go along", () => {
    const parent = box("k", "Kunden");
    const trashInside = box("t", "Trash", "trash", "k");
    expect(folderActions(parent, [parent, trashInside]).remove).toBe(false);
    expect(folderActions(parent, [parent, box("h", "Hoffmann", null, "k")]).remove).toBe(true);
  });

  it("follows the rights in a shared mailbox", () => {
    const shared = {
      ...box("k", "Kunden"),
      unreadEmails: 2,
      myRights: { mayRename: false, mayDelete: false, maySetSeen: false },
    };
    expect(folderActions(shared)).toEqual({ rename: false, remove: false, markRead: false });
  });
});
