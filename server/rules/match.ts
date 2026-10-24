/**
 * The rules applied to a mail that is already there, the same way the Sieve script applies them on
 * arrival (script.ts): substring tests without regard to case, every matching rule in order, the
 * first folder wins, "stop" ends the list. Pure functions.
 */
import { isEffective, type Rule, type RuleCondition } from "./script";

/** What a rule looks at; addresses without names, like Sieve's `address :all`. */
export type MailFacts = { from: string[]; to: string[]; subject: string; body: string };

export type Outcome = { moveTo: Rule["moveTo"]; markRead: boolean; flag: boolean };

const fold = (text: string) => text.toLowerCase();

const valuesOf = (mail: MailFacts, field: RuleCondition["field"]): string[] =>
  ({ from: mail.from, to: mail.to, subject: [mail.subject], body: [mail.body] })[field];

const holds = ({ field, operator, value }: RuleCondition, mail: MailFacts): boolean => {
  const wanted = fold(value.trim());
  const values = valuesOf(mail, field).map(fold);
  if (operator === "is") return values.some((candidate) => candidate === wanted);
  const contained = values.some((candidate) => candidate.includes(wanted));
  return operator === "contains" ? contained : !contained;
};

export const ruleMatches = (rule: Rule, mail: MailFacts): boolean => {
  const conditions = rule.conditions.filter((condition) => condition.value.trim());
  return rule.match === "all"
    ? conditions.every((condition) => holds(condition, mail))
    : conditions.some((condition) => holds(condition, mail));
};

export const outcome = (rules: Rule[], mail: MailFacts): Outcome => {
  const result: Outcome = { moveTo: null, markRead: false, flag: false };
  for (const rule of rules.filter(isEffective)) {
    if (!ruleMatches(rule, mail)) continue;
    result.moveTo ??= rule.moveTo;
    result.markRead ||= rule.markRead;
    result.flag ||= rule.flag;
    if (rule.stop) break;
  }
  return result;
};

/** Whether any rule reads the text, so the text is fetched only then. */
export const readsBody = (rules: Rule[]): boolean =>
  rules.some((rule) => rule.conditions.some((condition) => condition.field === "body"));
