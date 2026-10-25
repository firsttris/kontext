/**
 * Firmenverwaltung → Telefonie → Sprachmenü: before it rings the caller hears a greeting ("Für
 * den Kundendienst drücken Sie die 1 …") and picks by key who it rings for, or the mailbox.
 * Without a key it rings as usual.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCompany } from "@/features/company/queries";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { type Admin, send, useAdminChange } from "./api";
import { SoundSelect } from "./sounds";

type Option = Admin["menu"]["options"][number];

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

const OptionEditor = ({
  option,
  onChange,
  onRemove,
}: {
  option: Option;
  onChange: (option: Option) => void;
  onRemove: () => void;
}) => {
  const { data: company } = useCompany();
  const people = (company?.employees ?? []).filter((employee) => employee.active);
  return (
    <fieldset className="m-0 flex flex-col gap-2 rounded-lg border border-border p-3">
      <legend className="px-1 text-[13px] font-medium">
        {m.phone_menu_key({ digit: option.digit })}
      </legend>
      <div className="flex flex-wrap gap-2">
        <Label className="w-24">
          {m.phone_menu_digit()}
          <Select
            value={option.digit}
            onChange={(event) => onChange({ ...option, digit: event.target.value })}
          >
            {DIGITS.map((digit) => (
              <option key={digit} value={digit}>
                {digit}
              </option>
            ))}
          </Select>
        </Label>
        <Label className="min-w-0 flex-1">
          {m.phone_menu_label()}
          <Input
            value={option.label}
            onChange={(event) => onChange({ ...option, label: event.target.value })}
          />
        </Label>
      </div>
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={option.mailbox}
          onChange={(event) => onChange({ ...option, mailbox: event.target.checked })}
          className="size-4 accent-[var(--accent)]"
        />
        {m.phone_menu_mailbox()}
      </label>
      {option.mailbox ? null : (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {people.map((employee) => (
            <label key={employee.id} className="flex items-center gap-2 text-[14px]">
              <input
                type="checkbox"
                checked={option.members.includes(employee.id)}
                onChange={(event) =>
                  onChange({
                    ...option,
                    members: event.target.checked
                      ? [...option.members, employee.id]
                      : option.members.filter((id) => id !== employee.id),
                  })
                }
                className="size-4 accent-[var(--accent)]"
              />
              {employee.fullName}
            </label>
          ))}
        </div>
      )}
      <Button size="sm" variant="ghost" className="self-start" onClick={onRemove}>
        {m.phone_menu_remove()}
      </Button>
    </fieldset>
  );
};

export const MenuForm = ({ menu, sounds }: { menu: Admin["menu"]; sounds: Admin["sounds"] }) => {
  const toast = useToast();
  const [enabled, setEnabled] = useState(menu.enabled);
  const [greeting, setGreeting] = useState(menu.greeting ?? "");
  const [options, setOptions] = useState(menu.options);
  const save = useAdminChange(() =>
    send("PUT", "/menu", { enabled, greeting: greeting || null, options }),
  );
  const free = DIGITS.find((digit) => !options.some((option) => option.digit === digit)) ?? "0";
  return (
    <SettingsCard title={m.phone_menu()} description={m.phone_menu_hint()}>
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        {m.phone_menu_enabled()}
      </label>
      <Label>
        {m.phone_menu_greeting()}
        <SoundSelect
          sounds={sounds}
          none={m.phone_menu_no_greeting()}
          value={greeting}
          onChange={(event) => setGreeting(event.target.value)}
        />
      </Label>
      {options.map((option, index) => (
        <OptionEditor
          key={option.digit}
          option={option}
          onChange={(next) =>
            setOptions((current) => current.map((other, i) => (i === index ? next : other)))
          }
          onRemove={() => setOptions((current) => current.filter((_, i) => i !== index))}
        />
      ))}
      <div className="flex gap-2">
        <Button
          disabled={options.length >= DIGITS.length}
          onClick={() =>
            setOptions((current) => [
              ...current,
              { digit: free, label: "", members: [], mailbox: false },
            ])
          }
        >
          {m.phone_menu_add()}
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
