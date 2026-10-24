// @vitest-environment node
import { describe, expect, it } from "vitest";
import { type Call, RESURFACED, validUntil, wake } from "./snooze";

const snooze = { accountId: "a", emailId: "m1", until: "", by: "jonas" };

/** A JMAP account with an inbox, a snoozed folder and one mail in `mailboxIds`. */
const account = (mailboxIds: Record<string, boolean> | null) => {
  const sets: unknown[] = [];
  const call: Call = async <T>(calls: unknown[]) =>
    (calls as [string, Record<string, unknown>, string][]).map(([name, args]) => {
      if (name === "Mailbox/query") {
        const role = (args.filter as { role: string }).role;
        return { ids: [role === "inbox" ? "inbox" : "snoozed"] };
      }
      if (name === "Email/get") {
        return {
          list: mailboxIds
            ? [{ mailboxIds, subject: "Angebot", from: [{ name: "Markus", email: "m@x.de" }] }]
            : [],
        };
      }
      sets.push(args.update);
      return { updated: { m1: null } };
    }) as T[];
  return { call, sets };
};

describe("wake", () => {
  it("moves the mail back to the inbox, unread and marked", async () => {
    const { call, sets } = account({ snoozed: true });
    expect(await wake(call, snooze)).toEqual({
      subject: "Angebot",
      from: [{ name: "Markus", email: "m@x.de" }],
    });
    expect(sets).toEqual([
      {
        m1: {
          "mailboxIds/snoozed": null,
          "mailboxIds/inbox": true,
          "keywords/$seen": null,
          [`keywords/${RESURFACED}`]: true,
        },
      },
    ]);
  });

  it("leaves a mail alone that was moved on or is gone", async () => {
    for (const mailboxIds of [{ archive: true }, null]) {
      const { call, sets } = account(mailboxIds);
      expect(await wake(call, snooze)).toBeNull();
      expect(sets).toEqual([]);
    }
  });
});

describe("validUntil", () => {
  const now = new Date("2026-10-24T10:00:00Z");
  it("wants a time ahead, within a year", () => {
    expect(validUntil(new Date("2026-10-24T10:05:00Z"), now)).toBe(true);
    expect(validUntil(new Date("2026-10-24T09:59:00Z"), now)).toBe(false);
    expect(validUntil(new Date("2027-11-01T10:00:00Z"), now)).toBe(false);
  });
});
