import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import { markMailboxRead } from "./folders";

describe("marking a whole folder read", () => {
  it("stops with an error when a page changes nothing, instead of asking for ever", async () => {
    let queries = 0;
    // A server that accepts the change but keeps finding the same unread mail.
    const client = {
      request: async () => {
        queries += 1;
        if (queries > 5) throw new Error("asked again and again");
        return [
          ["Email/query", { ids: ["m1"] }, "q"],
          ["Email/get", { list: [{ id: "m1", mailboxIds: { k: true } }] }, "g"],
        ];
      },
      call: async () => ({ updated: { m1: null } }),
    } as unknown as JmapClient;
    await expect(markMailboxRead(client, "a", "k")).rejects.toThrow(/nicht weiter/);
    expect(queries).toBe(2);
  });
});
