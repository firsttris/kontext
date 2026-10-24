import { describe, expect, it } from "vitest";
import type { Mailbox } from "@/jmap/types";
import {
  highlightTerms,
  isEmptySearch,
  parseDay,
  parseSearch,
  type SearchAccount,
  sinceDays,
  toEmailFilter,
  toggleToken,
  tokenize,
  wordVariants,
} from "./mail-search";

const today = "2026-10-23";

const box = (
  id: string,
  name: string,
  role: string | null = null,
  parentId: string | null = null,
) => ({ id, name, role, parentId }) as Mailbox;
const mailboxes = [
  box("in", "Inbox", "inbox"),
  box("se", "Sent Items", "sent"),
  box("tr", "Deleted Items", "trash"),
  box("ju", "Junk Mail", "junk"),
  box("ku", "Kunden"),
  box("ho", "Hoffmann", null, "ku"),
];
const paths: Record<string, string> = { ho: "Kunden/Hoffmann" };
const own: SearchAccount = {
  label: "jonas@weber-haustechnik.test",
  isPersonal: true,
  mailboxes,
  path: (m) => paths[m.id] ?? m.name,
  categories: [{ keyword: "erledigt", name: "Erledigt", color: "green" }],
};
const info: SearchAccount = {
  ...own,
  label: "info@",
  isPersonal: false,
  categories: [{ keyword: "in-bearbeitung", name: "In Bearbeitung", color: "blue" }],
};

describe("parseSearch", () => {
  it("splits words, phrases and operators in German and English", () => {
    expect(tokenize('angebot betreff:"neues bad" von:hoffmann')).toEqual([
      "angebot",
      'betreff:"neues bad"',
      "von:hoffmann",
    ]);
    const query = parseSearch(
      '"neues bad" wärmepumpe from:keller an:anna subject:Angebot hat:anhang is:unread ist:markiert',
      today,
    );
    expect(query).toMatchObject({
      words: ["neues bad", "wärmepumpe"],
      from: ["keller"],
      to: ["anna"],
      subject: ["Angebot"],
      hasAttachment: true,
      unread: true,
      flagged: true,
    });
  });
  it("reads dates in several forms", () => {
    expect(parseDay("2026-10-01", today)).toBe("2026-10-01");
    expect(parseDay("1.10.2026", today)).toBe("2026-10-01");
    expect(parseDay("5.3.", today)).toBe("2026-03-05");
    expect(parseDay("heute", today)).toBe(today);
    expect(parseDay("gestern", today)).toBe("2026-10-22");
    expect(parseDay("bald", today)).toBeUndefined();
    expect(parseSearch("nach:1.10. vor:2026-10-20", today)).toMatchObject({
      after: "2026-10-01",
      before: "2026-10-20",
    });
  });
  it("treats unknown operators as words", () => {
    expect(parseSearch("uhrzeit:10:30 foo", today).words).toEqual(["uhrzeit:10:30", "foo"]);
  });
  it("knows an empty search and what to mark", () => {
    expect(isEmptySearch(parseSearch("  ", today))).toBe(true);
    expect(isEmptySearch(parseSearch("hat:anhang", today))).toBe(false);
    expect(highlightTerms(parseSearch("angebote von:keller a", today))).toEqual([
      "angebote",
      "angebot",
      "keller",
    ]);
  });
});

describe("toEmailFilter", () => {
  it("finds a category by its name in each account's own categories", () => {
    const query = parseSearch('kategorie:"in bearbeitung" in:info@', today);
    expect(query.categories).toEqual(["in bearbeitung"]);
    expect(toEmailFilter(query, info)).toEqual({
      operator: "AND",
      conditions: [{ inMailboxOtherThan: ["tr", "ju"] }, { hasKeyword: "in-bearbeitung" }],
    });
    expect(toEmailFilter(parseSearch("label:Erledigt", today), info)).toBeNull();
    expect(toEmailFilter(parseSearch("label:Erledigt", today), own)).toMatchObject({
      conditions: [{ inMailboxOtherThan: ["tr", "ju"] }, { hasKeyword: "erledigt" }],
    });
  });

  it("searches everywhere but trash and spam", () => {
    expect(toEmailFilter(parseSearch("angebot von:keller", today), own)).toEqual({
      operator: "AND",
      conditions: [{ inMailboxOtherThan: ["tr", "ju"] }, { text: "angebot" }, { from: "keller" }],
    });
  });
  it("maps flags and dates", () => {
    const filter = toEmailFilter(
      parseSearch("hat:anhang ist:ungelesen ist:markiert nach:2026-10-01", today),
      own,
    ) as { conditions: unknown[] };
    expect(filter.conditions).toEqual(
      expect.arrayContaining([
        { hasAttachment: true },
        { notKeyword: "$seen" },
        { hasKeyword: "$flagged" },
        { after: "2026-09-30T22:00:00Z" },
      ]),
    );
  });
  it("limits to a folder by role, name or path", () => {
    expect(toEmailFilter(parseSearch("in:gesendet", today), own)).toEqual({ inMailbox: "se" });
    expect(toEmailFilter(parseSearch("in:kunden/hoffmann", today), own)).toEqual({
      inMailbox: "ho",
    });
    expect(toEmailFilter(parseSearch("in:papierkorb", today), own)).toEqual({ inMailbox: "tr" });
    expect(toEmailFilter(parseSearch("in:gibtsnicht", today), own)).toBeNull();
  });
  it("limits to one mailbox like info@", () => {
    expect(toEmailFilter(parseSearch("in:info@ angebot", today), own)).toBeNull();
    expect(toEmailFilter(parseSearch("in:info@ angebot", today), info)).toEqual({
      operator: "AND",
      conditions: [{ inMailboxOtherThan: ["tr", "ju"] }, { text: "angebot" }],
    });
    expect(toEmailFilter(parseSearch("in:jonas@", today), own)).not.toBeNull();
  });
});

describe("wordVariants", () => {
  it("adds the base form of German plurals", () => {
    expect(wordVariants("Angebote")).toEqual(["Angebote", "Angebot"]);
    expect(wordVariants("Rechnungen")).toEqual(["Rechnungen", "Rechnung"]);
    expect(wordVariants("Kundinnen")).toEqual(["Kundinnen", "Kundin"]);
    expect(wordVariants("Termine")).toEqual(["Termine", "Termin"]);
    expect(wordVariants("Bad")).toEqual(["Bad"]);
    expect(wordVariants("neues bad")).toEqual(["neues bad"]);
  });
  it("asks for both forms", () => {
    expect(toEmailFilter(parseSearch("angebote", today), own)).toEqual({
      operator: "AND",
      conditions: [
        { inMailboxOtherThan: ["tr", "ju"] },
        { operator: "OR", conditions: [{ text: "angebote" }, { text: "angebot" }] },
      ],
    });
  });
});

describe("toggleToken", () => {
  it("adds and removes chips", () => {
    expect(toggleToken("angebot", "hat:anhang")).toBe("angebot hat:anhang");
    expect(toggleToken("angebot hat:anhang", "hat:anhang")).toBe("angebot");
    expect(toggleToken("angebot nach:2026-01-01", sinceDays(30, today))).toBe(
      "angebot nach:2026-09-23",
    );
  });
});
