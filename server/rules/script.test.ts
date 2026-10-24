// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the expected Sieve text uses its own "${…}" variables
import { describe, expect, it } from "vitest";
import { isEffective, parseRules, type Rule, rulesScript } from "./script";

const rule = (patch: Partial<Rule> = {}): Rule => ({
  id: "r1",
  name: "Steuerbüro",
  enabled: true,
  match: "all",
  conditions: [{ field: "from", operator: "contains", value: "steuerbuero-kraus.de" }],
  moveTo: { id: "m", path: "Steuerberater" },
  markRead: false,
  flag: false,
  forwardTo: null,
  stop: false,
  ...patch,
});

describe("rulesScript", () => {
  it("files into the folder by id with its path as fallback, once at the end", () => {
    const script = rulesScript({ vacation: false, rules: [rule()] });
    expect(script).toContain(
      'if allof (string :is "${done}" "", address :all :contains "from" "steuerbuero-kraus.de") {',
    );
    expect(script).toContain(
      'if string :is "${folder}" "" { set "folder" "m"; set "path" "Steuerberater"; }',
    );
    expect(script.trim().split("\n").at(-1)).toBe(
      'if not string :is "${folder}" "" { fileinto :mailboxid "${folder}" "${path}"; }',
    );
  });

  it("lets spam through to Junk before any rule", () => {
    const lines = rulesScript({ vacation: true, rules: [rule()] }).split("\n");
    const spam = lines.findIndex((line) => line.startsWith("if spamtest"));
    expect(spam).toBeGreaterThan(lines.findIndex((line) => line.startsWith("require")));
    expect(spam).toBeLessThan(lines.findIndex((line) => line.startsWith("include")));
  });

  it("includes the out-of-office script only when the reply is on", () => {
    expect(rulesScript({ vacation: true, rules: [] })).toContain(
      'include :personal :optional "vacation";',
    );
    expect(rulesScript({ vacation: false, rules: [] })).not.toContain("include :personal");
  });

  it("writes marks, forwarding and stop in that order", () => {
    const script = rulesScript({
      vacation: false,
      rules: [
        rule({ markRead: true, flag: true, forwardTo: "anna@firma.de", stop: true, moveTo: null }),
      ],
    });
    const body = script.slice(script.indexOf("# Steuerbüro"));
    expect(body.split("\n").slice(2, 6)).toEqual([
      '  addflag "\\\\Seen";',
      '  addflag "\\\\Flagged";',
      '  redirect :copy "anna@firma.de";',
      '  set "done" "1";',
    ]);
  });

  it("combines conditions with allof or anyof and negates 'enthält nicht'", () => {
    const script = rulesScript({
      vacation: false,
      rules: [
        rule({
          match: "any",
          conditions: [
            { field: "to", operator: "is", value: "info@firma.de" },
            { field: "subject", operator: "notContains", value: "Rechnung" },
            { field: "body", operator: "contains", value: "Angebot" },
          ],
        }),
      ],
    });
    expect(script).toContain(
      'anyof (address :all :is ["to", "cc"] "info@firma.de", not header :contains "subject" "Rechnung", body :text :contains "Angebot")',
    );
  });

  it("escapes quotes, backslashes, line breaks and variable syntax in values", () => {
    const script = rulesScript({
      vacation: false,
      rules: [
        rule({ conditions: [{ field: "subject", operator: "contains", value: 'a"b\\c\nd ${x}' }] }),
      ],
    });
    expect(script).toContain('header :contains "subject" "a\\"b\\\\c d ${dollar}{x}"');
  });

  it("leaves out disabled rules and rules without a condition or action", () => {
    const script = rulesScript({
      vacation: false,
      rules: [
        rule({ id: "a", name: "aus", enabled: false }),
        rule({
          id: "b",
          name: "leer",
          conditions: [{ field: "from", operator: "contains", value: " " }],
        }),
        rule({ id: "c", name: "nichts", moveTo: null }),
      ],
    });
    expect(script).not.toMatch(/^# (aus|leer|nichts)$/m);
    expect(parseRules(script)?.rules.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });
});

describe("parseRules", () => {
  it("reads back what rulesScript wrote", () => {
    const stored = { vacation: true, rules: [rule(), rule({ id: "r2", name: "Zweite\nZeile" })] };
    expect(parseRules(rulesScript(stored))).toEqual(stored);
  });

  it("ignores scripts it did not write", () => {
    expect(parseRules('require ["fileinto"];\nfileinto "x";\n')).toBeNull();
    expect(parseRules("# sekretaer:{kaputt\n")).toBeNull();
    expect(parseRules('# sekretaer:{"vacation":1}\n')).toBeNull();
  });
});

describe("isEffective", () => {
  it("needs enabled, a filled condition and an action", () => {
    expect(isEffective(rule())).toBe(true);
    expect(isEffective(rule({ enabled: false }))).toBe(false);
    expect(isEffective(rule({ moveTo: null }))).toBe(false);
    expect(isEffective(rule({ moveTo: null, flag: true }))).toBe(true);
  });
});
