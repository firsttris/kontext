import { describe, expect, it } from "vitest";
import type { JmapClient } from "./client";
import { assertAccepted, isRefusedError, refusedByAll } from "./refused";

type Call = [string, Record<string, unknown>, string];

/** A server whose submission has this delivery status; it keeps what it was asked. */
const fakeServer = (deliveryStatus: Record<string, { smtpReply: string }> | null) => {
  const calls: Call[] = [];
  const client = {
    request: async (batch: Call[]) => {
      calls.push(...batch);
      const [name, , id] = batch[0]!;
      return name === "EmailSubmission/get"
        ? [[name, { list: [{ id: "s1", deliveryStatus }] }, id]]
        : [[name, { updated: {}, destroyed: [] }, id]];
    },
  } as unknown as JmapClient;
  return { client, calls };
};

const UNKNOWN = { smtpReply: "550 5.1.1 Mailbox does not exist." };
const LIMIT = { smtpReply: "452 4.4.5 Rate limit exceeded, try again later." };
const QUEUED = { smtpReply: "250 2.1.5 Queued" };

describe("refusedByAll", () => {
  it("names every recipient with its reply when none was taken", () => {
    expect(refusedByAll({ "niemand@weber.test": UNKNOWN, "anna@weber.test": LIMIT })).toEqual([
      { email: "niemand@weber.test", reply: "550 5.1.1 Mailbox does not exist." },
      { email: "anna@weber.test", reply: "452 4.4.5 Rate limit exceeded, try again later." },
    ]);
  });

  it("is empty when one recipient was taken, or nothing is known", () => {
    expect(refusedByAll({ "niemand@weber.test": UNKNOWN, "anna@weber.test": QUEUED })).toEqual([]);
    expect(refusedByAll(null)).toEqual([]);
    expect(refusedByAll({})).toEqual([]);
  });
});

describe("assertAccepted", () => {
  it("asks nothing for a queued submission", async () => {
    const { client, calls } = fakeServer({ "niemand@weber.test": UNKNOWN });
    await assertAccepted(client, "a", { id: "s1", undoStatus: "pending" }, "e1", "drafts");
    expect(calls).toEqual([]);
  });

  it("passes a mail sent at once to a recipient that took it", async () => {
    const { client, calls } = fakeServer({ "anna@weber.test": QUEUED });
    await assertAccepted(client, "a", { id: "s1", undoStatus: "final" }, "e1", "drafts");
    expect(calls.map(([name]) => name)).toEqual(["EmailSubmission/get"]);
  });

  it("puts a mail no one took back among the drafts and says why", async () => {
    const { client, calls } = fakeServer({ "anna@weber.test": LIMIT });
    const error = await assertAccepted(
      client,
      "a",
      { id: "s1", undoStatus: "final" },
      "e1",
      "drafts",
    ).catch((caught: unknown) => caught);
    expect(isRefusedError(error)).toBe(true);
    expect(error).toMatchObject({
      message: "anna@weber.test: 452 4.4.5 Rate limit exceeded, try again later.",
      draftId: "e1",
    });
    expect(calls[1]).toEqual([
      "Email/set",
      { accountId: "a", update: { e1: { mailboxIds: { drafts: true }, "keywords/$draft": true } } },
      "0",
    ]);
  });

  it("removes a refused encrypted mail instead, which is no draft", async () => {
    const { client, calls } = fakeServer({ "anna@weber.test": UNKNOWN });
    const error = await assertAccepted(
      client,
      "a",
      { id: "s1", undoStatus: "final" },
      "e1",
      null,
    ).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ draftId: null });
    expect(calls[1]).toEqual(["Email/set", { accountId: "a", destroy: ["e1"] }, "0"]);
  });
});
