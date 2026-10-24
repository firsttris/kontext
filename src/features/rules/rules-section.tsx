/** The mail rules in the settings: the list in the order they apply, each one a sentence. */
import { ArrowDown, ArrowRight, ArrowUp, ListFilter, Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import {
  moveRule,
  newRule,
  type Rule,
  ruleTitle,
  thenText,
  upsertRule,
  whenText,
} from "@/lib/rules";
import { m } from "@/paraglide/messages";
import { useFilters } from "../settings/queries";
import { SettingsCard } from "../settings/settings-page";
import { useRuleFolders, useSaveRules } from "./queries";
import { RuleDialog } from "./rule-dialog";

const RuleRow = ({
  rule,
  first,
  last,
  onEdit,
  onChange,
}: {
  rule: Rule;
  first: boolean;
  last: boolean;
  onEdit: () => void;
  onChange: (rules: (current: Rule[]) => Rule[]) => void;
}) => {
  const folders = useRuleFolders();
  const folderName = (id: string) => folders.find((folder) => folder.id === id)?.label;
  const title = ruleTitle(rule);
  return (
    <li className="flex items-start gap-3 px-3 py-3 md:px-4">
      <button
        type="button"
        onClick={onEdit}
        aria-label={`${m.rules_edit()}: ${title}`}
        className="flex min-w-0 flex-1 flex-col gap-1 text-left"
      >
        <span
          className={
            rule.enabled ? "text-[14px] font-medium" : "text-[14px] font-medium text-muted"
          }
        >
          {title}
        </span>
        {rule.name.trim() ? <span className="text-[13px] text-muted">{whenText(rule)}</span> : null}
        <span className="flex gap-1.5 text-[13px] text-muted">
          <ArrowRight size={13} className="mt-[3px] shrink-0" aria-hidden="true" />
          <span>{thenText(rule, folderName).join(" · ")}</span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1">
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={m.rules_up()}
          disabled={first}
          onClick={() => onChange((rules) => moveRule(rules, rule.id, -1))}
        >
          <ArrowUp size={15} />
        </Button>
        <Button
          variant="ghost"
          size="iconSm"
          aria-label={m.rules_down()}
          disabled={last}
          onClick={() => onChange((rules) => moveRule(rules, rule.id, 1))}
        >
          <ArrowDown size={15} />
        </Button>
        <Switch
          checked={rule.enabled}
          label={m.rules_enabled({ name: title })}
          onChange={(enabled) => onChange((rules) => upsertRule(rules, { ...rule, enabled }))}
        />
      </div>
    </li>
  );
};

export const RulesSection = () => {
  const toast = useToast();
  const { data: filters, isPending } = useFilters();
  const save = useSaveRules();
  const [editing, setEditing] = useState<Rule | null>(null);
  const rules = filters?.rules ?? [];

  const change = async (next: (current: Rule[]) => Rule[]) => {
    try {
      await save.mutateAsync(next(rules));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <SettingsCard title={m.settings_rules()} description={m.rules_hint()}>
      {isPending ? <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p> : null}
      {filters && !rules.length ? (
        <div className="flex flex-col items-center gap-2 rounded-lg bg-subtle px-6 py-8 text-center">
          <ListFilter size={22} className="text-muted" />
          <p className="m-0 max-w-[380px] text-[13px] text-muted">{m.rules_empty()}</p>
        </div>
      ) : null}
      {rules.length ? (
        <ol
          aria-label={m.settings_rules()}
          className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0"
        >
          {rules.map((rule, index) => (
            <RuleRow
              key={rule.id}
              rule={rule}
              first={index === 0}
              last={index === rules.length - 1}
              onEdit={() => setEditing(rule)}
              onChange={(next) => void change(next)}
            />
          ))}
        </ol>
      ) : null}
      <Button
        variant="primary"
        className="self-start"
        disabled={!filters}
        onClick={() => setEditing(newRule(crypto.randomUUID()))}
      >
        <Plus size={15} /> {m.rules_add()}
      </Button>
      {editing ? <RuleDialog initial={editing} onClose={() => setEditing(null)} /> : null}
    </SettingsCard>
  );
};
