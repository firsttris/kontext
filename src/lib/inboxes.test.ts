import { describe, expect, it } from "vitest";
import type { EmailSummary, Mailbox } from "@/jmap/types";
import { type Feed, type Inbox, mergeFeeds } from "./inboxes";
import type { MailAccount } from "./mail-accounts";

const account = (id: string, name: string, isPersonal: boolean): MailAccount => ({
  id,
  name,
  isPersonal,
  isReadOnly: false,
  kind: isPersonal ? "own" : "shared",
});
const inbox = (a: MailAccount): Inbox => ({ account: a, mailbox: { id: "i" } as Mailbox });
const mail = (id: string, hour: number): EmailSummary =>
  ({ id, receivedAt: `2026-10-23T${String(hour).padStart(2, "0")}:00:00Z` }) as EmailSummary;
const feed = (emails: EmailSummary[], hasMore = false): Feed => ({
  emails,
  hasMore,
  pending: false,
  fetching: false,
  fetchMore: () => {},
  total: emails.length,
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
    expect(rows.map((r) => r.account.label)).toEqual(["", "info@weber.test", ""]);
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

describe("mergeFeeds in another order", () => {
  const flagged = (id: string, hour: number) =>
    ({ ...mail(id, hour), keywords: { $flagged: true } }) as EmailSummary;
  const plain = (id: string, hour: number) => ({ ...mail(id, hour), keywords: {} }) as EmailSummary;

  it("merges the accounts' lists in the chosen order", () => {
    const rows = mergeFeeds(
      [inbox(own), inbox(info)],
      { d: feed([flagged("a", 6), plain("b", 12)]), b: feed([flagged("c", 9), plain("e", 10)]) },
      "flagged",
    );
    expect(rows.map((r) => r.email.id)).toEqual(["c", "a", "b", "e"]);
  });
  it("keeps each account's order and waits for an account with more to load", () => {
    const rows = mergeFeeds(
      [inbox(own), inbox(info)],
      { d: feed([flagged("a", 6), plain("b", 12)]), b: feed([flagged("c", 9)], true) },
      "flagged",
    );
    // info@'s next page may hold a flagged mail newer than "a": "a" waits for it.
    expect(rows.map((r) => r.email.id)).toEqual(["c"]);
  });
  it("ranks categories by each account's own list", () => {
    const tagged = (id: string, hour: number, keyword: string) =>
      ({ ...mail(id, hour), keywords: { [keyword]: true } }) as EmailSummary;
    const rows = mergeFeeds(
      [inbox(own), inbox(info)],
      { d: feed([tagged("a", 6, "privat"), plain("b", 12)]), b: feed([tagged("c", 9, "privat")]) },
      "category",
      (accountId) => (accountId === "d" ? ["privat"] : []),
    );
    expect(rows.map((r) => r.email.id)).toEqual(["a", "b", "c"]);
  });
});
