// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  createMailboxFolders,
  type FolderIds,
  type MailboxPeople,
  shareChanges,
} from "./mailboxes";
import type { DocumentNode, DocumentShare, Person, Schreibzeug } from "./schreibzeug";

/** Schreibzeug in memory: folders per owner and their shares. */
const fakeSchreibzeug = () => {
  const folders: (DocumentNode & { owner: string })[] = [];
  const shares = new Map<string, DocumentShare[]>();
  const schreibzeug = {
    list: async (person: Person) => ({
      folder: null,
      path: [],
      children: folders.filter((folder) => folder.owner === person.id),
    }),
    createFolder: async (person: Person, _parentId: string | null, name: string) => {
      const folder = { id: `f${folders.length + 1}`, kind: "folder" as const, name };
      folders.push({ ...folder, owner: person.id });
      return folder;
    },
    shares: async (_person: Person, nodeId: string) => shares.get(nodeId) ?? [],
    share: async (_person: Person, nodeId: string, email: string, role: "edit" | "view") => {
      const rest = (shares.get(nodeId) ?? []).filter((share) => share.email !== email);
      shares.set(nodeId, [...rest, { userId: `user:${email}`, email, role }]);
    },
    unshare: async (_person: Person, nodeId: string, userId: string) => {
      shares.set(
        nodeId,
        (shares.get(nodeId) ?? []).filter((share) => share.userId !== userId),
      );
    },
  } as unknown as Schreibzeug;
  return { schreibzeug, folders, shares };
};

/** Kontext's database for the folders' ids, in memory. */
const memoryIds = (): FolderIds => {
  const kept = new Map<string, string>();
  return {
    get: async (mailboxId) => kept.get(mailboxId) ?? null,
    set: async (mailboxId, folderId) => {
      kept.set(mailboxId, folderId);
    },
  };
};

const info = (people: MailboxPeople["people"]): MailboxPeople => ({
  id: "m1",
  email: "info@weber.test",
  people,
});

describe("shared mailboxes' folders", () => {
  it("changes only what differs", () => {
    const current: DocumentShare[] = [
      { userId: "u1", email: "jonas@weber.test", role: "edit" },
      { userId: "u2", email: "max@weber.test", role: "edit" },
      { userId: "pending:anna@weber.test", email: "anna@weber.test", role: "edit" },
    ];
    expect(
      shareChanges(current, [
        { email: "Jonas@weber.test", role: "edit" },
        { email: "anna@weber.test", role: "view" },
        { email: "sandra@weber.test", role: "edit" },
      ]),
    ).toEqual([
      { kind: "remove", userId: "u2" },
      { kind: "put", email: "anna@weber.test", role: "view" },
      { kind: "put", email: "sandra@weber.test", role: "edit" },
    ]);
  });

  it("makes the mailbox's own folder once and shares it with its people", async () => {
    const { schreibzeug, folders, shares } = fakeSchreibzeug();
    let mailbox = info([
      { email: "jonas@weber.test", role: "edit" },
      { email: "max@weber.test", role: "view" },
    ]);
    const mailboxFolders = createMailboxFolders({
      schreibzeug,
      load: async () => [mailbox],
      ids: memoryIds(),
    });

    expect(await mailboxFolders.foldersFor("JONAS@weber.test")).toEqual([
      { accountId: "m1", email: "info@weber.test", folderId: "f1" },
    ]);
    expect(folders).toEqual([
      { id: "f1", kind: "folder", name: "info@weber.test", owner: "mailbox:m1" },
    ]);
    expect(shares.get("f1")?.map(({ email, role }) => [email, role])).toEqual([
      ["jonas@weber.test", "edit"],
      ["max@weber.test", "view"],
    ]);
    // Someone outside the mailbox gets nothing, and its people are not told to them.
    expect(await mailboxFolders.foldersFor("anna@weber.test")).toEqual([]);
    expect(await mailboxFolders.peopleOf("anna@weber.test", ["m1"])).toEqual([]);
    // Only members share the mailbox's files, not who only reads it.
    expect(await mailboxFolders.ownersFor("jonas@weber.test")).toEqual([
      { id: "mailbox:m1", email: "info@weber.test", name: "info@weber.test" },
    ]);
    expect(await mailboxFolders.ownersFor("max@weber.test")).toEqual([]);

    // Max leaves the mailbox: the Firmenverwaltung's change takes the folder away from him.
    mailbox = info([{ email: "jonas@weber.test", role: "edit" }]);
    await mailboxFolders.changed("m1");
    expect(folders).toHaveLength(1);
    expect(shares.get("f1")?.map((share) => share.email)).toEqual(["jonas@weber.test"]);
    expect(await mailboxFolders.peopleOf("jonas@weber.test", ["m1"])).toEqual(["jonas@weber.test"]);
  });

  it("finds a folder the mailbox already has after a restart", async () => {
    const { schreibzeug, folders } = fakeSchreibzeug();
    const load = async () => [info([{ email: "jonas@weber.test", role: "edit" }])];
    await createMailboxFolders({ schreibzeug, load, ids: memoryIds() }).foldersFor(
      "jonas@weber.test",
    );
    await createMailboxFolders({ schreibzeug, load, ids: memoryIds() }).foldersFor(
      "jonas@weber.test",
    );
    expect(folders).toHaveLength(1);
  });

  it("keeps the folder by its id when a member renamed it, also after a restart", async () => {
    const { schreibzeug, folders, shares } = fakeSchreibzeug();
    let mailbox = info([
      { email: "jonas@weber.test", role: "edit" },
      { email: "max@weber.test", role: "edit" },
    ]);
    const load = async () => [mailbox];
    const ids = memoryIds();
    await createMailboxFolders({ schreibzeug, load, ids }).foldersFor("jonas@weber.test");
    const original = folders[0]!;
    // Max renames it in Dokumente (an edit share may), then Kontext restarts and Max leaves.
    original.name = "Info – Ablage";
    mailbox = info([{ email: "jonas@weber.test", role: "edit" }]);
    await createMailboxFolders({ schreibzeug, load, ids }).changed("m1");
    expect(folders).toHaveLength(1);
    expect(shares.get(original.id)?.map((share) => share.email)).toEqual(["jonas@weber.test"]);
  });
});
