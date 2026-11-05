import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import { exportMailbox } from "./mbox-export";

/**
 * A folder of `count` mails, oldest first, as Email/query and Email/get answer for it, and the
 * download of each; `onDownload` may change the folder while the export runs.
 */
const folderOf = (count: number, onDownload: (folder: string[], id: string) => void = () => {}) => {
  const folder = Array.from({ length: count }, (_, index) => `m${index}`);
  const client = {
    request: async (calls: [string, Record<string, unknown>, string][]) => {
      const [, query] = calls[0]!;
      const position = (query.position as number) ?? 0;
      const limit = (query.limit as number) ?? folder.length;
      const ids = folder.slice(position, position + limit);
      const list = ids.map((id) => ({
        id,
        blobId: id,
        receivedAt: "2026-11-05T09:04:00Z",
        keywords: {},
        from: null,
      }));
      return [
        ["Email/query", { ids, position, total: folder.length }, "q"],
        ["Email/get", { list, notFound: [] }, "g"],
      ];
    },
    call: async (method: string, args: Record<string, unknown>) => {
      if (method === "Email/query") {
        const position = (args.position as number) ?? 0;
        const limit = (args.limit as number) ?? folder.length;
        return { ids: folder.slice(position, position + limit), position, total: folder.length };
      }
      const ids = (args.ids as string[] | undefined) ?? [];
      if (method !== "Email/get") throw new Error(`unexpected ${method}`);
      return {
        list: ids
          .filter((id) => folder.includes(id))
          .map((id) => ({
            id,
            blobId: id,
            receivedAt: "2026-11-05T09:04:00Z",
            keywords: {},
            from: null,
          })),
        notFound: ids.filter((id) => !folder.includes(id)),
      };
    },
    download: async (_accountId: string, blobId: string) => {
      onDownload(folder, blobId);
      return new Blob([`Subject: ${blobId}\r\n\r\nText\r\n`]);
    },
  } as unknown as JmapClient;
  return client;
};

const subjects = async (mbox: Blob) =>
  [...(await mbox.text()).matchAll(/^Subject: (\S+)/gm)].map((m) => m[1]);

describe("exportMailbox", () => {
  it("writes every mail of a folder of more than one page", async () => {
    const mbox = await exportMailbox(folderOf(150), "a", "f");
    expect(await subjects(mbox)).toHaveLength(150);
  });

  it("leaves no mail out when one already written leaves the folder during the export", async () => {
    // A colleague files the oldest mail of the shared mailbox away while the export downloads.
    const client = folderOf(150, (folder, id) => {
      if (id === "m0") folder.splice(0, 1);
    });
    const mbox = await exportMailbox(client, "a", "f");
    const written = await subjects(mbox);
    expect(written).toContain("m100");
    expect(written).toHaveLength(150);
  });
});
