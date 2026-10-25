/**
 * Firmenverwaltung → Telefonie → Türsprechstelle: the door intercom at the Fritzbox calls its
 * telephones by an internal number ("**11"). When it calls the box, it rings in Kontext for the
 * chosen people with "Tür öffnen" (the box sends the opening code) and "Sprechen".
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCompany } from "@/features/company/queries";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { type Admin, send, useAdminChange } from "./api";

export const DoorForm = ({ door }: { door: Admin["door"] }) => {
  const toast = useToast();
  const { data: company } = useCompany();
  const [draft, setDraft] = useState(door);
  const save = useAdminChange(() => send("PUT", "/door", draft));
  const people = (company?.employees ?? []).filter((employee) => employee.active);
  return (
    <SettingsCard title={m.phone_door_settings()} description={m.phone_door_hint()}>
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })}
          className="size-4 accent-[var(--accent)]"
        />
        {m.phone_door_enabled()}
      </label>
      <div className="flex flex-wrap gap-2">
        <Label className="min-w-0 flex-1">
          {m.phone_door_number()}
          <Input
            value={draft.number}
            onChange={(event) => setDraft({ ...draft, number: event.target.value })}
          />
        </Label>
        <Label className="min-w-0 flex-1">
          {m.phone_door_code()}
          <Input
            value={draft.code}
            onChange={(event) => setDraft({ ...draft, code: event.target.value })}
          />
        </Label>
      </div>
      <fieldset className="m-0 flex flex-wrap gap-x-4 gap-y-1 border-0 p-0">
        <legend className="mb-1 text-[13px] font-medium">{m.phone_door_members()}</legend>
        {people.map((employee) => (
          <label key={employee.id} className="flex items-center gap-2 text-[14px]">
            <input
              type="checkbox"
              checked={draft.members.includes(employee.id)}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  members: event.target.checked
                    ? [...draft.members, employee.id]
                    : draft.members.filter((id) => id !== employee.id),
                })
              }
              className="size-4 accent-[var(--accent)]"
            />
            {employee.fullName}
          </label>
        ))}
      </fieldset>
      <Button
        variant="primary"
        className="self-start"
        disabled={save.isPending}
        onClick={async () => {
          await save.mutateAsync(undefined);
          toast.show(m.company_saved());
        }}
      >
        {m.company_save()}
      </Button>
    </SettingsCard>
  );
};
