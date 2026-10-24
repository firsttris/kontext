import { describe, expect, it } from "vitest";
import type { Account, Mailbox } from "@/jmap/types";
import { moveTargets } from "./move-targets";

const box = (
  id: string,
  name: string,
  role: string | null = null,
  parentId: string | null = null,
) => ({ id, name, role, parentId, sortOrder: 0, totalEmails: 0, unreadEmails: 0 }) as Mailbox;

const account = (id: string, name: string, isPersonal: boolean): Account => ({
  id,
  name,
  isPersonal,
  isReadOnly: false,
});

const own = account("a", "jonas@weber-haustechnik.test", true);
const info = account("b", "info@weber-haustechnik.test", false);

const mailboxes = {
  a: [
    box("a-in", "Inbox", "inbox"),
    box("a-dr", "Drafts", "drafts"),
    box("a-tr", "Deleted Items", "trash"),
    box("a-k", "Kunden"),
    box("a-h", "Hoffmann", null, "a-k"),
    box("a-st", "Steuerberater"),
  ],
  b: [
    box("b-in", "Inbox", "inbox"),
    box("b-tr", "Deleted Items", "trash"),
    box("b-er", "Erledigt"),
  ],
};

const labels = (groups: ReturnType<typeof moveTargets>) =>
  groups.map((group) => [group.account.id, group.targets.map((target) => target.label)]);

describe("moveTargets", () => {
  it("offers the mail's own mailbox first, then the others with all their folders", () => {
    const groups = moveTargets([own, info], mailboxes, { accountId: "b", mailboxId: "b-in" });
    expect(labels(groups)).toEqual([
      ["b", ["Papierkorb", "Erledigt"]],
      ["a", ["Posteingang", "Papierkorb", "Kunden", "Kunden / Hoffmann", "Steuerberater"]],
    ]);
  });

  it("leaves out the folder the mail is in, drafts, and folders one may not add to", () => {
    const readOnly = {
      ...mailboxes,
      b: [{ ...box("b-in", "Inbox", "inbox"), myRights: { mayAddItems: false } }],
    };
    const groups = moveTargets([own, info], readOnly, { accountId: "a", mailboxId: "a-k" });
    expect(labels(groups)).toEqual([
      ["a", ["Posteingang", "Papierkorb", "Kunden / Hoffmann", "Steuerberater"]],
    ]);
  });

  it("skips mailboxes whose folders are not loaded yet", () => {
    const groups = moveTargets(
      [own, info],
      { a: mailboxes.a },
      { accountId: "a", mailboxId: "a-in" },
    );
    expect(groups.map((group) => group.account.id)).toEqual(["a"]);
  });
});
