import { describe, expect, it } from "vitest";
import { type MailFacts, outcome, readsBody, ruleMatches } from "./match";
import type { Rule } from "./script";

const rule = (patch: Partial<Rule> = {}): Rule => ({
  id: "r",
  name: "",
  enabled: true,
  match: "all",
  conditions: [{ field: "from", operator: "contains", value: "kraus" }],
  moveTo: { id: "m", path: "Steuerberater" },
  markRead: false,
  flag: false,
  forwardTo: null,
  categories: [],
  stop: false,
  ...patch,
});

const mail: MailFacts = {
  from: ["Buero@Steuer-Kraus.de"],
  to: ["anna@firma.de", "info@firma.de"],
  subject: "Ihre Rechnung Nr. 12",
  body: "Anbei das Angebot.",
};

describe("ruleMatches", () => {
  it("finds parts of addresses and texts without regard to case", () => {
    expect(ruleMatches(rule(), mail)).toBe(true);
    expect(
      ruleMatches(
        rule({ conditions: [{ field: "body", operator: "contains", value: "ANGEBOT" }] }),
        mail,
      ),
    ).toBe(true);
  });

  it("'ist genau' compares whole values; 'enthält nicht' needs no address to contain it", () => {
    const is = (value: string) =>
      ruleMatches(rule({ conditions: [{ field: "to", operator: "is", value }] }), mail);
    expect(is("info@firma.de")).toBe(true);
    expect(is("info@firma")).toBe(false);
    const without = (value: string) =>
      ruleMatches(rule({ conditions: [{ field: "to", operator: "notContains", value }] }), mail);
    expect(without("info@")).toBe(false);
    expect(without("rechnung@")).toBe(true);
  });

  it("needs all or one of the conditions, ignoring empty ones", () => {
    const conditions: Rule["conditions"] = [
      { field: "subject", operator: "contains", value: "Rechnung" },
      { field: "subject", operator: "contains", value: "Mahnung" },
      { field: "subject", operator: "contains", value: " " },
    ];
    expect(ruleMatches(rule({ conditions }), mail)).toBe(false);
    expect(ruleMatches(rule({ conditions, match: "any" }), mail)).toBe(true);
  });
});

describe("outcome", () => {
  it("applies every matching rule; the first folder wins", () => {
    expect(
      outcome(
        [
          rule(),
          rule({ id: "b", moveTo: { id: "x", path: "X" }, flag: true }),
          rule({ id: "c", markRead: true }),
        ],
        mail,
      ),
    ).toEqual({
      moveTo: { id: "m", path: "Steuerberater" },
      markRead: true,
      flag: true,
      categories: [],
    });
  });

  it("stops after a rule with stop, and skips disabled rules", () => {
    expect(
      outcome(
        [rule({ enabled: false, flag: true }), rule({ stop: true }), rule({ markRead: true })],
        mail,
      ),
    ).toEqual({
      moveTo: { id: "m", path: "Steuerberater" },
      markRead: false,
      flag: false,
      categories: [],
    });
  });
});

describe("readsBody", () => {
  it("is true only when a rule looks at the text", () => {
    expect(readsBody([rule()])).toBe(false);
    expect(
      readsBody([rule({ conditions: [{ field: "body", operator: "contains", value: "x" }] })]),
    ).toBe(true);
  });
});
