import { describe, expect, it } from "vitest";
import type { EmailSummary } from "@/jmap/types";
import {
  compareMails,
  DEFAULT_SORT,
  MAIL_SORTS,
  type MailSort,
  readMailSort,
  sortComparators,
} from "./mail-sort";

const NEWEST = { property: "receivedAt", isAscending: false };

describe("readMailSort", () => {
  it("keeps a known choice", () => {
    for (const sort of MAIL_SORTS) expect(readMailSort(sort)).toBe(sort);
  });
  it("falls back to newest first for anything else", () => {
    expect(readMailSort(null)).toBe(DEFAULT_SORT);
    expect(readMailSort("")).toBe("newest");
    expect(readMailSort("biggest")).toBe("newest");
  });
});

describe("sortComparators", () => {
  it("sorts by date for newest and oldest", () => {
    expect(sortComparators("newest")).toEqual([NEWEST]);
    expect(sortComparators("oldest")).toEqual([{ property: "receivedAt", isAscending: true }]);
  });
  it("puts mails without $seen first, flagged ones first, then the newest", () => {
    expect(sortComparators("unread")).toEqual([
      { property: "hasKeyword", keyword: "$seen", isAscending: true },
      NEWEST,
    ]);
    expect(sortComparators("flagged")).toEqual([
      { property: "hasKeyword", keyword: "$flagged", isAscending: false },
      NEWEST,
    ]);
  });
  it("decides for the whole conversation in the conversation view", () => {
    expect(sortComparators("unread", { threads: true })[0]).toEqual({
      property: "allInThreadHaveKeyword",
      keyword: "$seen",
      isAscending: true,
    });
    expect(sortComparators("flagged", { threads: true })[0]).toEqual({
      property: "someInThreadHaveKeyword",
      keyword: "$flagged",
      isAscending: false,
    });
  });
  it("puts each category first in the account's order", () => {
    expect(sortComparators("category", { categories: ["erledigt", "in-bearbeitung"] })).toEqual([
      { property: "hasKeyword", keyword: "erledigt", isAscending: false },
      { property: "hasKeyword", keyword: "in-bearbeitung", isAscending: false },
      NEWEST,
    ]);
    expect(sortComparators("category")).toEqual([NEWEST]);
  });
  it("sorts sender and subject from A, size from the largest", () => {
    expect(sortComparators("from")).toEqual([{ property: "from", isAscending: true }, NEWEST]);
    expect(sortComparators("subject")).toEqual([
      { property: "subject", isAscending: true },
      NEWEST,
    ]);
    expect(sortComparators("size")).toEqual([{ property: "size", isAscending: false }, NEWEST]);
  });
});

const mail = (
  id: string,
  hour: number,
  more: Partial<EmailSummary> = {},
): { email: EmailSummary; categories: string[] } => ({
  email: {
    id,
    receivedAt: `2026-10-23T${String(hour).padStart(2, "0")}:00:00Z`,
    keywords: {},
    from: null,
    subject: null,
    size: 0,
    ...more,
  } as EmailSummary,
  categories: ["in-bearbeitung", "erledigt"],
});

const order = (sort: MailSort, mails: ReturnType<typeof mail>[]) =>
  [...mails].sort(compareMails(sort)).map((item) => item.email.id);

describe("compareMails", () => {
  const read = mail("read", 12, { keywords: { $seen: true } });
  const unread = mail("unread", 8);
  const flagged = mail("flagged", 6, { keywords: { $flagged: true, $seen: true } });

  it("orders by date", () => {
    expect(order("newest", [unread, read, flagged])).toEqual(["read", "unread", "flagged"]);
    expect(order("oldest", [unread, read, flagged])).toEqual(["flagged", "unread", "read"]);
  });
  it("puts unread and flagged mails first, the newest first among them", () => {
    expect(order("unread", [read, flagged, unread])).toEqual(["unread", "read", "flagged"]);
    expect(order("flagged", [read, unread, flagged])).toEqual(["flagged", "read", "unread"]);
  });
  it("puts mails with a category first, in the account's order of categories", () => {
    const done = mail("done", 4, { keywords: { erledigt: true } });
    const working = mail("working", 2, { keywords: { "in-bearbeitung": true } });
    expect(order("category", [read, done, working])).toEqual(["working", "done", "read"]);
  });
  it("sorts by sender name or address, by subject and by size", () => {
    const anna = mail("anna", 1, { from: [{ name: "anna Weber", email: "a@x" }], size: 10 });
    const bea = mail("bea", 2, { from: [{ name: null, email: "Bea@x" }], size: 30 });
    expect(order("from", [bea, anna])).toEqual(["anna", "bea"]);
    expect(order("size", [anna, bea])).toEqual(["bea", "anna"]);
    const angebot = mail("angebot", 1, { subject: "angebot" });
    const bestellung = mail("bestellung", 2, { subject: "Bestellung" });
    expect(order("subject", [bestellung, angebot])).toEqual(["angebot", "bestellung"]);
  });
});
