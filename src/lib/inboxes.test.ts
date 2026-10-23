import { describe, expect, it } from "vitest";
import type { Account, EmailSummary, Mailbox } from "@/jmap/types";
import { type Feed, type Inbox, mergeFeeds } from "./inboxes";

const account = (id: string, name: string, isPersonal: boolean): Account => ({
  id,
  name,
  isPersonal,
  isReadOnly: false,
});
const inbox = (a: Account): Inbox => ({ account: a, mailbox: { id: "i" } as Mailbox });
const mail = (id: string, hour: number): EmailSummary =>
  ({ id, receivedAt: `2026-10-23T${String(hour).padStart(2, "0")}:00:00Z` }) as EmailSummary;
const feed = (emails: EmailSummary[], hasMore = false): Feed => ({
  emails,
  hasMore,
  pending: false,
  fetching: false,
  fetchMore: () => {},
});

const own = account("d", "jonas@weber.test", true);
const info = account("b", "info@weber.test", false);

describe("mergeFeeds", () => {
  it("sorts all mails newest first and labels the shared ones", () => {
    const rows = mergeFeeds([inbox(own), inbox(info)], {
      d: feed([mail("a", 12), mail("b", 8)]),
      b: feed([mail("c", 10)]),
    });
    expect(rows.map((r) => r.email.id)).toEqual(["a", "c", "b"]);
    expect(rows.map((r) => r.account.label)).toEqual(["", "info@", ""]);
  });
  it("holds back older mails while another account still has pages to load", () => {
    const rows = mergeFeeds([inbox(own), inbox(info)], {
      d: feed([mail("a", 12), mail("b", 6)]),
      b: feed([mail("c", 11), mail("e", 9)], true),
    });
    // info@ may still have mails between 9:00 and 6:00, so "b" waits.
    expect(rows.map((r) => r.email.id)).toEqual(["a", "c", "e"]);
  });
  it("copes with accounts that have not answered yet", () => {
    expect(mergeFeeds([inbox(own), inbox(info)], { d: feed([mail("a", 12)]) })).toHaveLength(1);
  });
});
