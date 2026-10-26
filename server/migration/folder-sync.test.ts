import { describe, expect, it } from "vitest";
import { batchesOf, syncFolder } from "./folder-sync";
import { type ImapSource, MAX_MAIL_BYTES } from "./imap-source";
import { type Importer, INLINE_LIMIT } from "./importer";
import type { SyncCounts } from "./syncs";

const head = (uid: number, size = 1000) => ({
  uid,
  messageId: `${uid}@x`,
  flags: new Set<string>(),
  internalDate: null,
  size,
});

describe("batchesOf", () => {
  it("puts at most 25 mails into a request", () => {
    const sizes = batchesOf(Array.from({ length: 60 }, (_, i) => head(i))).map((b) => b.length);
    expect(sizes).toEqual([25, 25, 10]);
  });

  it("starts a new batch before 6 MB and keeps a large mail alone", () => {
    const batches = batchesOf([head(1, 4_000_000), head(2, 3_000_000), head(3, INLINE_LIMIT + 1)]);
    expect(batches.map((b) => b.map((h) => h.uid))).toEqual([[1], [2], [3]]);
  });
});

describe("syncFolder", () => {
  const stand = (heads: ReturnType<typeof head>[], arrives: number[]) => {
    const fetched: number[][] = [];
    const sent: Uint8Array[][] = [];
    const source = {
      newUids: async () => ({ uidValidity: "1", uids: heads.map((h) => h.uid) }),
      heads: async () => heads,
      sources: async (_path: string, uids: number[]) => {
        fetched.push(uids);
        return new Map(
          uids.filter((uid) => arrives.includes(uid)).map((uid) => [uid, new Uint8Array([uid])]),
        );
      },
    } as unknown as ImapSource;
    const importer = {
      addToFolders: async () => undefined,
      importMails: async (_account: string, mails: { raw: Uint8Array }[]) => {
        sent.push(mails.map((mail) => mail.raw));
        return { imported: mails.length, ids: mails.map((mail) => `email-${mail.raw[0]}`) };
      },
    } as unknown as Importer;
    return { source, importer, fetched, sent };
  };

  it("does not even fetch a mail the server calls too large", async () => {
    const { source, importer, fetched } = stand([head(1), head(2, MAX_MAIL_BYTES + 1)], [1, 2]);
    const counts = { imported: 0, added: 0, failed: 0 } as SyncCounts;
    await syncFolder({
      importer,
      source,
      accountId: "a",
      path: "INBOX",
      mailboxId: "m",
      known: new Map(),
      counts,
      previous: undefined,
      save: async () => undefined,
    });
    expect(fetched.flat()).toEqual([1]);
    expect(counts).toMatchObject({ imported: 1, failed: 1 });
  });

  it("files every mail under its own id when one in the batch did not come", async () => {
    const { source, importer } = stand([head(1), head(2), head(3)], [1, 3]);
    const known = new Map<string, string>();
    await syncFolder({
      importer,
      source,
      accountId: "a",
      path: "INBOX",
      mailboxId: "m",
      known,
      counts: { imported: 0, added: 0, failed: 0 } as SyncCounts,
      previous: undefined,
      save: async () => undefined,
    });
    expect(Object.fromEntries(known)).toEqual({ "1@x": "email-1", "3@x": "email-3" });
  });
});
