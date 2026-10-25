/**
 * Firmenverwaltung → Telefonie → Weitere Rufnummern: direct numbers. Each is another IP phone at
 * the Fritzbox (set to react to that number only) with its own people; who is on one calls out
 * with it, so the other side sees their direct number.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCompany } from "@/features/company/queries";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { type Admin, send, useAdminChange } from "./api";

type Draft = {
  id?: string;
  label: string;
  username: string;
  password: string;
  ring: string[];
};

const LineEditor = ({
  draft,
  onChange,
  onRemove,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onRemove: () => void;
}) => {
  const { data: company } = useCompany();
  const people = (company?.employees ?? []).filter((employee) => employee.active);
  return (
    <fieldset className="m-0 flex flex-col gap-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-[13px] font-medium">{draft.label || m.phone_line_new()}</legend>
      <div className="flex flex-wrap gap-2">
        <Label className="min-w-0 flex-1">
          {m.phone_line_label()}
          <Input
            value={draft.label}
            onChange={(event) => onChange({ ...draft, label: event.target.value })}
          />
        </Label>
        <Label className="min-w-0 flex-1">
          {m.phone_line_username()}
          <Input
            value={draft.username}
            autoComplete="off"
            onChange={(event) => onChange({ ...draft, username: event.target.value })}
          />
        </Label>
        <Label className="min-w-0 flex-1">
          {m.phone_line_password()}
          <Input
            type="password"
            value={draft.password}
            autoComplete="new-password"
            placeholder={draft.id ? m.phone_line_password_keep() : ""}
            onChange={(event) => onChange({ ...draft, password: event.target.value })}
          />
        </Label>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {people.map((employee) => (
          <label key={employee.id} className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={draft.ring.includes(employee.id)}
              onChange={(event) =>
                onChange({
                  ...draft,
                  ring: event.target.checked
                    ? [...draft.ring, employee.id]
                    : draft.ring.filter((id) => id !== employee.id),
                })
              }
              className="size-4 accent-[var(--accent)]"
            />
            {employee.fullName}
          </label>
        ))}
      </div>
      <Button size="sm" variant="ghost" className="self-start" onClick={onRemove}>
        {m.phone_line_remove()}
      </Button>
    </fieldset>
  );
};

export const LinesForm = ({ lines }: { lines: Admin["extraLines"] }) => {
  const toast = useToast();
  const [drafts, setDrafts] = useState<Draft[]>(lines.map((line) => ({ ...line, password: "" })));
  const save = useAdminChange(() => send("PUT", "/lines", { lines: drafts }));
  const update = (index: number, draft: Draft) =>
    setDrafts((current) => current.map((other, i) => (i === index ? draft : other)));
  return (
    <SettingsCard title={m.phone_lines()} description={m.phone_lines_hint()}>
      {drafts.map((draft, index) => (
        <LineEditor
          // biome-ignore lint/suspicious/noArrayIndexKey: new lines have no id yet
          key={draft.id ?? index}
          draft={draft}
          onChange={(next) => update(index, next)}
          onRemove={() => setDrafts((current) => current.filter((_, i) => i !== index))}
        />
      ))}
      <div className="flex gap-2">
        <Button
          onClick={() =>
            setDrafts((current) => [
              ...current,
              { label: "", username: "", password: "", ring: [] },
            ])
          }
        >
          {m.phone_line_add()}
        </Button>
        <Button
          variant="primary"
          disabled={save.isPending}
          onClick={async () => {
            await save.mutateAsync(undefined);
            toast.show(m.company_saved());
          }}
        >
          {m.company_save()}
        </Button>
      </div>
    </SettingsCard>
  );
};
