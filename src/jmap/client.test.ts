import { describe, expect, it } from "vitest";
import { createJmapClient, isConcurrencyLimit } from "./client";

const SESSION = {
  apiUrl: "http://stalwart.test/jmap/",
  downloadUrl: "http://stalwart.test/jmap/download/{accountId}/{blobId}/{name}?accept={type}",
  uploadUrl: "http://stalwart.test/jmap/upload/{accountId}/",
  eventSourceUrl: "http://stalwart.test/jmap/eventsource/",
  accounts: {},
  primaryAccounts: {},
  capabilities: {},
  username: "jonas@weber-haustechnik.test",
  state: "s1",
};

/** What Stalwart answers when more requests of the account run at once than it takes. */
const busy = () =>
  Response.json(
    {
      type: "urn:ietf:params:jmap:error:limit",
      status: 400,
      limit: "maxConcurrentRequests",
      detail: "The request exceeds the maximum number of concurrent requests.",
    },
    { status: 400 },
  );

/** A server that is busy `times` times on /jmap/, then answers; it counts the API requests. */
const busyServer = (times: number) => {
  let apiCalls = 0;
  const fetch = (async (input: string) => {
    if (input.endsWith("/jmap/session")) return Response.json(SESSION);
    apiCalls++;
    return apiCalls <= times
      ? busy()
      : Response.json({ methodResponses: [["Mailbox/get", { list: [] }, "0"]] });
  }) as typeof globalThis.fetch;
  return { fetch, apiCalls: () => apiCalls };
};

const clientOf = (fetch: typeof globalThis.fetch) =>
  createJmapClient({ origin: "http://localhost", fetch, wait: async () => {} });

describe("isConcurrencyLimit", () => {
  it("knows Stalwart's answer to too many requests at once", async () => {
    expect(await isConcurrencyLimit(busy())).toBe(true);
  });

  it("leaves other errors alone", async () => {
    const tooLarge = Response.json(
      { type: "urn:ietf:params:jmap:error:limit", status: 400, limit: "maxCallsInRequest" },
      { status: 400 },
    );
    expect(await isConcurrencyLimit(tooLarge)).toBe(false);
    expect(await isConcurrencyLimit(new Response("kaputt", { status: 400 }))).toBe(false);
    expect(await isConcurrencyLimit(new Response("{}", { status: 500 }))).toBe(false);
  });
});

describe("a busy server", () => {
  it("is asked again until it answers", async () => {
    const server = busyServer(2);
    const { list } = await clientOf(server.fetch).call<{ list: unknown[] }>("Mailbox/get", {});
    expect(list).toEqual([]);
    expect(server.apiCalls()).toBe(3);
  });

  it("gives up after a few tries with the server's answer", async () => {
    const server = busyServer(Number.POSITIVE_INFINITY);
    await expect(clientOf(server.fetch).call("Mailbox/get", {})).rejects.toMatchObject({
      status: 400,
    });
    expect(server.apiCalls()).toBe(5);
  });
});
