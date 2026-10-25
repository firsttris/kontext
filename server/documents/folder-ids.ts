/** The ids of the shared mailboxes' folders in Dokumente, kept in Kontext's database. */
import { eq } from "drizzle-orm";
import type { Db } from "../db";
import * as schema from "../db/schema";
import type { FolderIds } from "./mailboxes";

export const createFolderIds = (db: Db): FolderIds => ({
  get: async (mailboxId) => {
    const [row] = await db
      .select()
      .from(schema.mailboxFolders)
      .where(eq(schema.mailboxFolders.mailboxId, mailboxId));
    return row?.folderId ?? null;
  },
  set: async (mailboxId, folderId) => {
    await db
      .insert(schema.mailboxFolders)
      .values({ mailboxId, folderId })
      .onConflictDoUpdate({ target: schema.mailboxFolders.mailboxId, set: { folderId } });
  },
});
