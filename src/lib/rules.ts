/**
 * The mail rules as the settings show them: a new rule, its sentence ("Wenn … dann …"), what is
 * missing before it can be saved, and the folder in the form Sieve finds it by. Pure; the script
 * itself is server/rules/script.ts.
 */
import type { Mailbox } from "@/jmap/types";
import { m } from "@/paraglide/messages";
import type { Rule, RuleCondition, RuleField, RuleOperator } from "../../server/rules/script";

export type { Rule, RuleCondition, RuleField, RuleOperator };

export const RULE_FIELDS: { field: RuleField; label: () => string }[] = [
  { field: "from", label: m.rules_field_from },
  { field: "to", label: m.rules_field_to },
  { field: "subject", label: m.rules_field_subject },
  { field: "body", label: m.rules_field_body },
];

const OPERATOR_LABELS: Record<RuleOperator, () => string> = {
  contains: m.rules_op_contains,
  notContains: m.rules_op_not_contains,
  is: m.rules_op_is,
};

/** "ist genau" only where a whole value can match: an address or the subject. */
export const operatorsFor = (field: RuleField): { operator: RuleOperator; label: string }[] =>
  (field === "body"
    ? (["contains", "notContains"] as const)
    : (["contains", "notContains", "is"] as const)
  ).map((operator) => ({ operator, label: OPERATOR_LABELS[operator]() }));

export const emptyCondition = (field: RuleField = "from", value = ""): RuleCondition => ({
  field,
  operator: "contains",
  value,
});

export const newRule = (id: string, conditions = [emptyCondition()]): Rule => ({
  id,
  name: "",
  enabled: true,
  match: "all",
  conditions,
  moveTo: null,
  markRead: false,
  flag: false,
  forwardTo: null,
  stop: false,
});

/** A rule for mails like this one: from its sender. */
export const ruleFromSender = (id: string, address: string): Rule =>
  newRule(id, [emptyCondition("from", address)]);

/** How Stalwart finds a folder by name: the names from the top, joined by "/". */
export const sievePath = (mailbox: Mailbox, mailboxes: Mailbox[]): string => {
  const parts: string[] = [];
  let current: Mailbox | undefined = mailbox;
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    parts.unshift(current.role === "inbox" ? "INBOX" : current.name);
    const parentId: string | null = current.parentId;
    current = parentId ? mailboxes.find((candidate) => candidate.id === parentId) : undefined;
  }
  return parts.join("/");
};

const filled = (rule: Rule) => rule.conditions.filter((condition) => condition.value.trim());

const conditionText = ({ field, operator, value }: RuleCondition): string =>
  m.rules_condition_text({
    field: RULE_FIELDS.find((entry) => entry.field === field)!.label(),
    operator: OPERATOR_LABELS[operator](),
    value: value.trim(),
  });

/** "Absender enthält „x“ und …" */
export const whenText = (rule: Rule): string =>
  filled(rule)
    .map(conditionText)
    .join(rule.match === "all" ? m.rules_and() : m.rules_or());

/** The rule's name, or its conditions when it has none. */
export const ruleTitle = (rule: Rule): string =>
  rule.name.trim() || whenText(rule) || m.rules_untitled();

/** "In „Kunden“ verschieben · Als gelesen markieren · …"; folders by id from `folderName`. */
export const thenText = (rule: Rule, folderName: (id: string) => string | undefined): string[] => [
  ...(rule.moveTo
    ? [m.rules_then_move({ folder: folderName(rule.moveTo.id) ?? rule.moveTo.path })]
    : []),
  ...(rule.markRead ? [m.rules_then_read()] : []),
  ...(rule.flag ? [m.rules_then_flag()] : []),
  ...(rule.forwardTo ? [m.rules_then_forward({ address: rule.forwardTo })] : []),
  ...(rule.stop ? [m.rules_then_stop()] : []),
];

const ADDRESS = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** What keeps the rule from being saved, or null. */
export const ruleProblem = (rule: Rule): string | null => {
  if (!filled(rule).length) return m.rules_problem_condition();
  if (!rule.moveTo && !rule.markRead && !rule.flag && !rule.forwardTo)
    return m.rules_problem_action();
  if (rule.forwardTo !== null && !ADDRESS.test(rule.forwardTo.trim()))
    return m.rules_problem_address();
  return null;
};

/** Before saving: empty conditions dropped, texts trimmed. */
export const cleanRule = (rule: Rule): Rule => ({
  ...rule,
  name: rule.name.trim(),
  conditions: filled(rule).map((condition) => ({ ...condition, value: condition.value.trim() })),
  forwardTo: rule.forwardTo?.trim() || null,
});

/** The list with `rule` put in place of the one with its id, or added at the end. */
export const upsertRule = (rules: Rule[], rule: Rule): Rule[] =>
  rules.some((candidate) => candidate.id === rule.id)
    ? rules.map((candidate) => (candidate.id === rule.id ? rule : candidate))
    : [...rules, rule];

/** The rule one place up (-1) or down (1); order matters, the first folder wins. */
export const moveRule = (rules: Rule[], id: string, step: -1 | 1): Rule[] => {
  const from = rules.findIndex((rule) => rule.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= rules.length) return rules;
  const next = [...rules];
  [next[from], next[to]] = [next[to]!, next[from]!];
  return next;
};
