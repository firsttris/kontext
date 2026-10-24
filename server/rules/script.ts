/**
 * Mail rules as one Sieve script (RFC 5228) that Stalwart runs when a mail arrives, so the rules
 * work without the app open. The rules themselves are kept as JSON in a comment line of the
 * script; the app reads back what it wrote and never parses Sieve. Pure functions, used by the
 * app and by the server (the Firmenverwaltung sets out-of-office replies too).
 *
 * How a mail goes through the script:
 * - Spam leaves first: Stalwart files a mail into Junk only when the script filed it nowhere
 *   (`is_spam && !did_file_into`, crates/email/src/sieve/ingest.rs).
 * - The out-of-office reply is the script Stalwart writes for VacationResponse, named "vacation"
 *   (crates/jmap/src/vacation/set.rs). It is included because Stalwart runs only one active
 *   script per account.
 * - Every enabled rule that matches applies its marks and forwarding, top to bottom. The first
 *   folder wins, so a mail is filed once and not copied into several folders. "Stop" skips the
 *   rules below.
 */
import { z } from "zod";
import { categorySchema } from "../categories/categories";

export const RULES_SCRIPT = "sekretaer-regeln";

const condition = z.object({
  field: z.enum(["from", "to", "subject", "body"]),
  operator: z.enum(["contains", "notContains", "is"]),
  value: z.string(),
});

const rule = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  match: z.enum(["all", "any"]),
  conditions: z.array(condition),
  /** The folder by id, with its path as Stalwart names it for when the id is gone. */
  moveTo: z.object({ id: z.string(), path: z.string() }).nullable(),
  markRead: z.boolean(),
  flag: z.boolean(),
  forwardTo: z.string().nullable(),
  /** Category keywords to set (categories/categories.ts); older rules have none. */
  categories: z.array(categorySchema.shape.keyword).max(10).default([]),
  stop: z.boolean(),
});

export const ruleSchema = rule;
export type RuleCondition = z.infer<typeof condition>;
export type RuleField = RuleCondition["field"];
export type RuleOperator = RuleCondition["operator"];
export type Rule = z.infer<typeof rule>;

const stored = z.object({ vacation: z.boolean(), rules: z.array(rule) });
export type StoredRules = z.infer<typeof stored>;

const MARKER = "# sekretaer:";

/** A rule does something only with a condition to match and an action to take. */
export const isEffective = (rule: Rule): boolean =>
  rule.enabled &&
  rule.conditions.some((condition) => condition.value.trim() !== "") &&
  Boolean(rule.moveTo || rule.markRead || rule.flag || rule.forwardTo || rule.categories.length);

/** A reference to a Sieve variable (RFC 5229), "${name}". */
const variable = (name: string) => `$\{${name}}`;

/**
 * A Sieve quoted string (RFC 5228 §2.4.2) without line breaks. With the variables extension
 * (RFC 5229) "${" in a value would be read as a variable; "${dollar}" puts back the "$".
 */
const quoted = (value: string) =>
  `"${value
    .replace(/[\r\n]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$\{/g, `${variable("dollar")}{`)}"`;

const test = ({ field, operator, value }: RuleCondition): string => {
  const match = operator === "is" ? ":is" : ":contains";
  const positive = {
    from: `address :all ${match} "from" ${quoted(value.trim())}`,
    to: `address :all ${match} ["to", "cc"] ${quoted(value.trim())}`,
    subject: `header ${match} "subject" ${quoted(value.trim())}`,
    body: `body :text ${match} ${quoted(value.trim())}`,
  }[field];
  return operator === "notContains" ? `not ${positive}` : positive;
};

const ruleTest = (rule: Rule): string => {
  const tests = rule.conditions.filter((condition) => condition.value.trim() !== "").map(test);
  const combined =
    tests.length === 1
      ? tests[0]!
      : `${rule.match === "all" ? "allof" : "anyof"} (${tests.join(", ")})`;
  return `allof (string :is "${variable("done")}" "", ${combined})`;
};

const ruleBlock = (rule: Rule): string[] => [
  `# ${rule.name.replace(/[\r\n]+/g, " ")}`,
  `if ${ruleTest(rule)} {`,
  ...(rule.markRead ? ['  addflag "\\\\Seen";'] : []),
  ...(rule.flag ? ['  addflag "\\\\Flagged";'] : []),
  ...rule.categories.map((keyword) => `  addflag ${quoted(keyword)};`),
  ...(rule.forwardTo ? [`  redirect :copy ${quoted(rule.forwardTo.trim())};`] : []),
  ...(rule.moveTo
    ? [
        `  if string :is "${variable("folder")}" "" { set "folder" ${quoted(rule.moveTo.id)}; set "path" ${quoted(rule.moveTo.path)}; }`,
      ]
    : []),
  ...(rule.stop ? ['  set "done" "1";'] : []),
  "}",
];

const REQUIRE = [
  "fileinto",
  "mailbox",
  "mailboxid",
  "imap4flags",
  "copy",
  "variables",
  "body",
  "include",
  "relational",
  "spamtest",
  "spamtestplus",
  "comparator-i;ascii-numeric",
];

/** The whole script: the stored rules in the marker line, then what Stalwart runs. */
export const rulesScript = ({ vacation, rules }: StoredRules): string =>
  [
    "# Sekretär: Regeln für eingehende Mails. Wird beim Speichern in Sekretär neu geschrieben.",
    `${MARKER}${JSON.stringify({ vacation, rules })}`,
    `require [${REQUIRE.map((name) => `"${name}"`).join(", ")}];`,
    'if spamtest :percent :value "ge" :comparator "i;ascii-numeric" "50" { stop; }',
    ...(vacation ? ['include :personal :optional "vacation";'] : []),
    'set "dollar" "$";',
    'set "folder" "";',
    'set "path" "";',
    'set "done" "";',
    ...rules.filter(isEffective).flatMap(ruleBlock),
    `if not string :is "${variable("folder")}" "" { fileinto :mailboxid "${variable("folder")}" "${variable("path")}"; }`,
    "",
  ].join("\n");

/** What `rulesScript` stored, or nothing for a script it did not write. */
export const parseRules = (script: string): StoredRules | null => {
  const line = script.split("\n").find((candidate) => candidate.startsWith(MARKER));
  if (!line) return null;
  try {
    const parsed = stored.safeParse(JSON.parse(line.slice(MARKER.length)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};
