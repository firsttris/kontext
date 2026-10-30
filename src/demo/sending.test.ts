import { describe, expect, it } from "vitest";
import { handleRequest } from "./jmap";
import { releaseDue, sendAtOf } from "./sending";
import { createStore } from "./store";

const NOW = new Date("2026-10-29T12:00:00Z");

describe("sendAtOf", () => {
  it("holds for seconds or until a time", async () => {
    const hold = (parameters: Record<string, string>) => ({ mailFrom: { parameters } });
    expect(sendAtOf(hold({ HOLDFOR: "10" }), NOW).toISOString()).toBe("2026-10-29T12:00:10.000Z");
    expect(sendAtOf(hold({ HOLDUNTIL: "2026-11-02T08:00:00Z" }), NOW).toISOString()).toBe(
      "2026-11-02T08:00:00.000Z",
    );
    expect(sendAtOf(undefined, NOW)).toBe(NOW);
  });
});

/** Jonas writes to Anna, held for `seconds` ("Rückgängig"). */
const send = async (seconds: number) => {
  const store = { ...createStore(), user: "jonas" };
  const { methodResponses } = await handleRequest(store, {
    methodCalls: [
      [
        "Email/set",
        {
          accountId: "jonas",
          create: {
            draft: {
              mailboxIds: { "jonas-drafts": true },
              keywords: { $draft: true, $seen: true },
              to: [{ name: "Anna Weber", email: "anna@weber-haustechnik.test" }],
              bcc: [{ name: "Max Weber", email: "max@weber-haustechnik.test" }],
              subject: "Urlaub",
              bodyValues: { text: { value: "Passt." } },
            },
          },
        },
        "0",
      ],
      [
        "EmailSubmission/set",
        {
          accountId: "jonas",
          create: {
            send: {
              emailId: "#draft",
              envelope: { mailFrom: { parameters: { HOLDFOR: String(seconds) } } },
            },
          },
          onSuccessUpdateEmail: {
            "#send": { "mailboxIds/jonas-drafts": null, "mailboxIds/jonas-sent": true },
          },
        },
        "1",
      ],
    ],
  });
  return { store, methodResponses };
};

const annasInbox = (store: ReturnType<typeof createStore>) =>
  [...store.emails.values()].filter((email) => email.mailboxIds["anna-inbox"]);

describe("EmailSubmission/set", () => {
  it("files the mail under Sent and delivers it to a colleague when the hold is over", async () => {
    const { store, methodResponses } = await send(10);
    expect(methodResponses.map(([name]) => name)).toEqual([
      "Email/set",
      "EmailSubmission/set",
      "Email/set",
    ]);
    const sent = [...store.emails.values()].find((email) => email.mailboxIds["jonas-sent"]);
    expect(sent?.subject).toBe("Urlaub");
    expect(annasInbox(store)).toHaveLength(1);

    expect(releaseDue(store, new Date(Date.now() + 11_000))).toBe(true);
    const delivered = annasInbox(store).find((email) => email.subject === "Urlaub");
    expect(delivered?.keywords).toEqual({});
  });

  it("takes back a mail while it is held", async () => {
    const { store, methodResponses } = await send(10);
    const submissionId = (methodResponses[1]![1].created as Record<string, { id: string }>).send!
      .id;
    const cancel = await handleRequest(store, {
      methodCalls: [
        [
          "EmailSubmission/set",
          { accountId: "jonas", update: { [submissionId]: { undoStatus: "canceled" } } },
          "0",
        ],
      ],
    });
    expect(cancel.methodResponses[0]![1].updated).toEqual({ [submissionId]: null });
    expect(releaseDue(store, new Date(Date.now() + 11_000))).toBe(false);
    expect(annasInbox(store)).toHaveLength(1);
  });

  it("delivers no Bcc line: Anna does not see that Max got the mail too", async () => {
    const { store } = await send(0);
    const delivered = annasInbox(store).find((email) => email.subject === "Urlaub");
    expect(delivered?.bcc).toBeNull();
  });
});
