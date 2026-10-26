import { describe, expect, it } from "vitest";
import { targetFolder } from "./folders";
import type { Folder, Importer } from "./importer";
import { folderResolver } from "./resolve";

/** An importer that only creates folders, remembering which. */
const fakeImporter = () => {
  const created: Folder[] = [];
  const importer = {
    createFolder: async (
      _accountId: string,
      name: string,
      parentId: string | null,
      role: string | null = null,
    ) => {
      const id = `new-${created.length + 1}`;
      created.push({ id, name, parentId, role });
      return id;
    },
  } as unknown as Importer;
  return { importer, created };
};

const inboxOnly: Folder[] = [{ id: "inbox", name: "Inbox", parentId: null, role: "inbox" }];

describe("folderResolver", () => {
  // readpst writes "Archiv/2020/*.eml" but nothing directly in "Archiv", so the runner resolves
  // only the subfolder; Stalwart creates no archive.
  it("puts a subfolder of a missing archive under a new archive folder", async () => {
    const { importer, created } = fakeImporter();
    const resolve = folderResolver(importer, "acc", inboxOnly);

    const sub = await resolve(targetFolder(["Persönliche Ordner", "Archiv", "2020"])!);

    expect(created).toEqual([
      { id: "new-1", name: "Archiv", parentId: null, role: "archive" },
      { id: "new-2", name: "2020", parentId: "new-1", role: null },
    ]);
    expect(sub).toBe("new-2");
  });

  it("reuses the new archive folder for later targets", async () => {
    const { importer, created } = fakeImporter();
    const resolve = folderResolver(importer, "acc", inboxOnly);

    await resolve(targetFolder(["Persönliche Ordner", "Archiv", "2020"])!);
    const archive = await resolve(targetFolder(["Persönliche Ordner", "Archiv"])!);
    const other = await resolve(targetFolder(["Persönliche Ordner", "Archiv", "2021"])!);

    expect(archive).toBe("new-1");
    expect(created.filter((folder) => folder.role === "archive")).toHaveLength(1);
    expect(created.find((folder) => folder.id === other)?.parentId).toBe("new-1");
  });

  // Stalwart refuses a sibling that differs only in case (crates/jmap/src/mailbox/set.rs).
  it("reuses a root folder whose name differs only in case", async () => {
    const existing: Folder[] = [
      ...inboxOnly,
      { id: "a", name: "archiv", parentId: null, role: null },
    ];
    const { importer, created } = fakeImporter();
    const resolve = folderResolver(importer, "acc", existing);

    const sub = await resolve(targetFolder(["Persönliche Ordner", "Archiv", "2020"])!);

    expect(created).toEqual([{ id: "new-1", name: "2020", parentId: "a", role: null }]);
    expect(sub).toBe("new-1");
  });

  it("reuses a subfolder whose name differs only in case", async () => {
    const existing: Folder[] = [
      ...inboxOnly,
      { id: "k", name: "kunden", parentId: "inbox", role: null },
    ];
    const { importer, created } = fakeImporter();
    const resolve = folderResolver(importer, "acc", existing);

    const sub = await resolve(targetFolder(["Persönliche Ordner", "Posteingang", "Kunden"])!);

    expect(created).toEqual([]);
    expect(sub).toBe("k");
  });

  it("puts a subfolder under the account's existing role folder", async () => {
    const { importer, created } = fakeImporter();
    const resolve = folderResolver(importer, "acc", inboxOnly);

    const sub = await resolve(targetFolder(["Persönliche Ordner", "Posteingang", "Kunden"])!);

    expect(created).toEqual([{ id: "new-1", name: "Kunden", parentId: "inbox", role: null }]);
    expect(sub).toBe("new-1");
  });
});
