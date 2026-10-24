import { describe, expect, it } from "vitest";
import type { Mailbox } from "@/jmap/types";
import {
  cleanRule,
  moveRule,
  newRule,
  operatorsFor,
  ruleFolders,
  ruleFromSender,
  ruleProblem,
  ruleTitle,
  sievePath,
  thenText,
  upsertRule,
  whenText,
} from "./rules";

const mailbox = (id: string, name: string, parentId: string | null, role: string | null = null) =>
  ({ id, name, parentId, role, sortOrder: 0 }) as Mailbox;

describe("sievePath", () => {
  it("joins the names from the top with / and calls the inbox INBOX", () => {
    const boxes = [
      mailbox("a", "Inbox", null, "inbox"),
      mailbox("k", "Kunden", null),
      mailbox("h", "Hoffmann", "k"),
    ];
    expect(sievePath(boxes[2]!, boxes)).toBe("Kunden/Hoffmann");
    expect(sievePath(mailbox("x", "Projekte", "a"), boxes)).toBe("INBOX/Projekte");
  });
});

describe("ruleFolders", () => {
  it("offers standard folders first and the own tree, but not inbox, drafts or sent", () => {
    const boxes = [
      mailbox("a", "Inbox", null, "inbox"),
      mailbox("d", "Drafts", null, "drafts"),
      mailbox("s", "Sent Items", null, "sent"),
      mailbox("t", "Deleted Items", null, "trash"),
      mailbox("k", "Kunden", null),
      mailbox("h", "Hoffmann", "k"),
    ];
    expect(ruleFolders(boxes)).toEqual([
      { id: "t", label: "Papierkorb", path: "Deleted Items" },
      { id: "k", label: "Kunden", path: "Kunden" },
      { id: "h", label: "Kunden / Hoffmann", path: "Kunden/Hoffmann" },
    ]);
  });
});

describe("rule texts", () => {
  const rule = {
    ...ruleFromSender("r", "kraus@steuerbuero.de"),
    moveTo: { id: "m", path: "Steuerberater" },
    markRead: true,
  };

  it("names a rule by its conditions when it has no name", () => {
    expect(ruleTitle(rule)).toBe("Absender enthält „kraus@steuerbuero.de“");
    expect(ruleTitle({ ...rule, name: " Steuerbüro " })).toBe("Steuerbüro");
  });

  it("joins conditions with und/oder and lists the actions", () => {
    const two = {
      ...rule,
      match: "any" as const,
      conditions: [
        ...rule.conditions,
        { field: "subject" as const, operator: "is" as const, value: "Mahnung" },
      ],
    };
    expect(whenText(two)).toBe(
      "Absender enthält „kraus@steuerbuero.de“ oder Betreff ist genau „Mahnung“",
    );
    expect(thenText(rule, (id) => (id === "m" ? "Steuerberater" : undefined))).toEqual([
      "nach „Steuerberater“ verschieben",
      "als gelesen markieren",
    ]);
  });

  it("falls back to the stored path for a folder that is gone", () => {
    expect(thenText(rule, () => undefined)[0]).toBe("nach „Steuerberater“ verschieben");
  });
});

describe("ruleProblem", () => {
  it("needs a condition, an action and a valid forwarding address", () => {
    expect(ruleProblem(newRule("r"))).toMatch(/Bedingung/);
    expect(ruleProblem(ruleFromSender("r", "x@y.de"))).toMatch(/passieren/);
    expect(ruleProblem({ ...ruleFromSender("r", "x@y.de"), forwardTo: "anna" })).toMatch(/Adresse/);
    expect(ruleProblem({ ...ruleFromSender("r", "x@y.de"), flag: true })).toBeNull();
  });
});

describe("cleanRule", () => {
  it("drops empty conditions and trims", () => {
    const rule = {
      ...newRule("r"),
      name: "  N ",
      conditions: [
        { field: "from" as const, operator: "contains" as const, value: " a@b.de " },
        { field: "subject" as const, operator: "contains" as const, value: "  " },
      ],
      forwardTo: " c@d.de ",
    };
    expect(cleanRule(rule)).toMatchObject({
      name: "N",
      conditions: [{ field: "from", operator: "contains", value: "a@b.de" }],
      forwardTo: "c@d.de",
    });
  });
});

describe("list changes", () => {
  const a = newRule("a");
  const b = newRule("b");
  it("replaces a rule by id or adds it", () => {
    expect(upsertRule([a, b], { ...a, name: "x" }).map((r) => r.name)).toEqual(["x", ""]);
    expect(upsertRule([a], b)).toEqual([a, b]);
  });
  it("moves a rule up and down within the list", () => {
    expect(moveRule([a, b], "b", -1)).toEqual([b, a]);
    expect(moveRule([a, b], "b", 1)).toEqual([a, b]);
  });
});

describe("operatorsFor", () => {
  it("offers 'ist genau' for addresses and subject, not for the text", () => {
    expect(operatorsFor("from").map((o) => o.operator)).toEqual(["contains", "notContains", "is"]);
    expect(operatorsFor("body").map((o) => o.operator)).toEqual(["contains", "notContains"]);
  });
});
