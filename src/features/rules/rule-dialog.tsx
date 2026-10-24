/**
 * One rule to write or change: "Wenn" with its conditions, "Dann" with what happens to the mail.
 * Opened from the settings and from a mail ("Regel erstellen …", with its sender filled in).
 */
import { Plus, X } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  cleanRule,
  emptyCondition,
  operatorsFor,
  RULE_FIELDS,
  type Rule,
  type RuleCondition,
  type RuleField,
  type RuleOperator,
  ruleProblem,
  upsertRule,
} from "@/lib/rules";
import { m } from "@/paraglide/messages";
import { useFilters } from "../settings/queries";
import { useRuleFolders, useSaveRules } from "./queries";

const ConditionRow = ({
  condition,
  onChange,
  onRemove,
}: {
  condition: RuleCondition;
  onChange: (condition: RuleCondition) => void;
  onRemove?: () => void;
}) => {
  const operators = operatorsFor(condition.field);
  const setField = (field: RuleField) =>
    onChange({
      ...condition,
      field,
      // "ist genau" is not offered for the text; it falls back to "enthält".
      operator: operatorsFor(field).some((entry) => entry.operator === condition.operator)
        ? condition.operator
        : "contains",
    });
  return (
    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 md:grid-cols-[124px_144px_1fr_auto]">
      <Select
        aria-label={m.rules_field()}
        value={condition.field}
        onChange={(e) => setField(e.target.value as RuleField)}
      >
        {RULE_FIELDS.map(({ field, label }) => (
          <option key={field} value={field}>
            {label()}
          </option>
        ))}
      </Select>
      <Select
        aria-label={m.rules_operator()}
        value={condition.operator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value as RuleOperator })}
      >
        {operators.map(({ operator, label }) => (
          <option key={operator} value={operator}>
            {label}
          </option>
        ))}
      </Select>
      <Input
        aria-label={m.rules_value()}
        value={condition.value}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        placeholder={condition.field === "from" ? "steuerbuero-kraus.de" : ""}
        className="col-span-2 row-start-2 md:col-span-1 md:row-start-auto"
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.rules_remove_condition()}
        disabled={!onRemove}
        onClick={onRemove}
        className="col-start-3 row-start-1 md:col-start-4"
      >
        <X size={15} />
      </Button>
    </div>
  );
};

/** A checkbox for an action, with its own fields below while it is on. */
const Action = ({
  label,
  checked,
  onChange,
  children,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  children?: ReactNode;
}) => (
  <div className="flex flex-col gap-2">
    <label className="flex items-center gap-2.5 text-[14px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-[var(--accent)]"
      />
      {label}
    </label>
    {checked && children ? <div className="pl-[26px]">{children}</div> : null}
  </div>
);

const Heading = ({ children }: { children: ReactNode }) => (
  <span className="text-[12px] font-semibold tracking-wide text-muted uppercase">{children}</span>
);

export const RuleDialog = ({
  initial,
  onClose,
}: {
  /** A new rule (not yet in the list) or one to change. */
  initial: Rule;
  onClose: () => void;
}) => {
  const toast = useToast();
  const { data: filters } = useFilters();
  const save = useSaveRules();
  const folders = useRuleFolders();
  const [rule, setRule] = useState(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isNew = !filters?.rules.some((candidate) => candidate.id === initial.id);
  const set = (patch: Partial<Rule>) => setRule((current) => ({ ...current, ...patch }));
  const setCondition = (index: number, condition: RuleCondition) =>
    set({ conditions: rule.conditions.map((c, i) => (i === index ? condition : c)) });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = ruleProblem(rule);
    setProblem(found);
    if (found || !filters) return;
    try {
      await save.mutateAsync(upsertRule(filters.rules, cleanRule(rule)));
      toast.show(m.rules_saved());
      onClose();
    } catch (error) {
      setProblem(m.common_error({ message: (error as Error).message }));
    }
  };

  const remove = async () => {
    if (!filters) return;
    try {
      await save.mutateAsync(filters.rules.filter((candidate) => candidate.id !== rule.id));
      toast.show(m.rules_deleted());
      onClose();
    } catch (error) {
      setProblem(m.common_error({ message: (error as Error).message }));
    }
  };

  const chooseFolder = (id: string) => {
    const folder = folders.find((candidate) => candidate.id === id);
    set({ moveTo: folder ? { id: folder.id, path: folder.path } : null });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={isNew ? m.rules_new_title() : m.rules_edit_title()}
      className="md:w-[min(600px,calc(100vw-32px))]"
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-5">
        <Label>
          {m.rules_name()}
          <Input value={rule.name} onChange={(e) => set({ name: e.target.value })} />
        </Label>

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <div className="flex items-center gap-2">
            <Heading>{m.rules_when()}</Heading>
            {rule.conditions.length > 1 ? (
              <Select
                aria-label={m.rules_when()}
                value={rule.match}
                onChange={(e) => set({ match: e.target.value as Rule["match"] })}
                className="h-8 w-auto text-[13px]"
              >
                <option value="all">{m.rules_match_all()}</option>
                <option value="any">{m.rules_match_any()}</option>
              </Select>
            ) : null}
          </div>
          {rule.conditions.map((condition, index) => (
            <ConditionRow
              // biome-ignore lint/suspicious/noArrayIndexKey: conditions have no id; rows only change in place or at the end
              key={index}
              condition={condition}
              onChange={(next) => setCondition(index, next)}
              onRemove={
                rule.conditions.length > 1
                  ? () => set({ conditions: rule.conditions.filter((_, i) => i !== index) })
                  : undefined
              }
            />
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            onClick={() => set({ conditions: [...rule.conditions, emptyCondition()] })}
          >
            <Plus size={14} /> {m.rules_add_condition()}
          </Button>
        </fieldset>

        <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
          <Heading>{m.rules_then()}</Heading>
          <Action
            label={m.rules_action_move()}
            checked={rule.moveTo !== null}
            onChange={(on) => chooseFolder(on ? (folders[0]?.id ?? "") : "")}
          >
            <Select
              aria-label={m.rules_choose_folder()}
              value={rule.moveTo?.id ?? ""}
              onChange={(e) => chooseFolder(e.target.value)}
            >
              {folders.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.label}
                </option>
              ))}
            </Select>
          </Action>
          <Action
            label={m.rules_action_read()}
            checked={rule.markRead}
            onChange={(markRead) => set({ markRead })}
          />
          <Action
            label={m.rules_action_flag()}
            checked={rule.flag}
            onChange={(flag) => set({ flag })}
          />
          <Action
            label={m.rules_action_forward()}
            checked={rule.forwardTo !== null}
            onChange={(on) => set({ forwardTo: on ? "" : null })}
          >
            <div className="flex flex-col gap-1.5">
              <Input
                type="email"
                aria-label={m.rules_forward_address()}
                value={rule.forwardTo ?? ""}
                onChange={(e) => set({ forwardTo: e.target.value })}
                placeholder="name@firma.de"
              />
              <span className="text-[12px] text-muted">{m.rules_action_forward_hint()}</span>
            </div>
          </Action>
          <div className="border-t border-border pt-3">
            <Action
              label={m.rules_action_stop()}
              checked={rule.stop}
              onChange={(stop) => set({ stop })}
            />
          </div>
        </fieldset>

        {problem ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {problem}
          </p>
        ) : null}
        <div className="flex gap-2">
          {isNew ? null : (
            <Button
              variant="danger"
              disabled={save.isPending}
              onClick={() => (confirmDelete ? void remove() : setConfirmDelete(true))}
            >
              {confirmDelete ? m.rules_delete_really() : m.rules_delete()}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="ghost" onClick={onClose}>
            {m.rules_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending || !filters}>
            {m.rules_save()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
