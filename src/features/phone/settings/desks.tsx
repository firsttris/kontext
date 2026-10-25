/**
 * Firmenverwaltung → Telefonie → Tischtelefone: Snom phones that sign in at the box instead of the
 * Fritzbox. They ring together with Kontext (a person's phone for that person's numbers), reach
 * each other by a short number and can be handed calls from Kontext. Each sets itself up from the
 * box: its provisioning address goes into the phone once.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCompany } from "@/features/company/queries";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { type Admin, send, useAdminChange } from "./api";

type Desk = Admin["deskPhones"][number];
type Draft = Omit<Desk, "id"> & { id?: string };

/** The next free short number from 21 on. Pure. */
export const nextExtension = (desks: Pick<Desk, "extension">[]) => {
  const taken = new Set(desks.map((desk) => desk.extension));
  let next = 21;
  while (taken.has(String(next))) next++;
  return String(next);
};

export const DesksForm = ({ desks }: { desks: Admin["deskPhones"] }) => {
  const toast = useToast();
  const { data: company } = useCompany();
  const [drafts, setDrafts] = useState<Draft[]>(desks);
  const save = useAdminChange(() => send("PUT", "/desks", { desks: drafts }));
  const people = (company?.employees ?? []).filter((employee) => employee.active);
  const update = (index: number, patch: Partial<Draft>) =>
    setDrafts((current) => current.map((desk, i) => (i === index ? { ...desk, ...patch } : desk)));
  return (
    <SettingsCard title={m.phone_desks()} description={m.phone_desks_hint()}>
      {drafts.map((desk, index) => (
        <fieldset
          key={desk.id ?? `new-${index}`}
          className="m-0 flex flex-col gap-2 rounded-lg border border-border p-3"
        >
          <legend className="px-1 text-[13px] font-medium">
            {desk.label || m.phone_desk_new()}
          </legend>
          <div className="flex flex-wrap gap-2">
            <Label className="min-w-0 flex-1">
              {m.phone_desk_label()}
              <Input
                value={desk.label}
                onChange={(event) => update(index, { label: event.target.value })}
              />
            </Label>
            <Label className="min-w-0 flex-1">
              {m.phone_desk_mac()}
              <Input
                value={desk.mac}
                placeholder="00:04:13:…"
                onChange={(event) => update(index, { mac: event.target.value })}
              />
            </Label>
            <Label className="w-24">
              {m.phone_desk_extension()}
              <Input
                value={desk.extension}
                inputMode="numeric"
                onChange={(event) => update(index, { extension: event.target.value })}
              />
            </Label>
            <Label className="min-w-0 flex-1">
              {m.phone_desk_member()}
              <Select
                value={desk.member ?? ""}
                onChange={(event) => update(index, { member: event.target.value || null })}
              >
                <option value="">{m.phone_desk_shared()}</option>
                {people.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.fullName}
                  </option>
                ))}
              </Select>
            </Label>
          </div>
          {desk.id ? (
            <p className="m-0 text-[12px] text-muted">
              {m.phone_desk_provisioning()}{" "}
              <code className="font-mono">{`http://<box>:8089/snom/${desk.mac}.xml`}</code>
            </p>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            className="self-start"
            onClick={() => setDrafts((current) => current.filter((_, i) => i !== index))}
          >
            {m.phone_desk_remove()}
          </Button>
        </fieldset>
      ))}
      <div className="flex gap-2">
        <Button
          onClick={() =>
            setDrafts((current) => [
              ...current,
              { label: "", mac: "", extension: nextExtension(current), member: null },
            ])
          }
        >
          {m.phone_desk_add()}
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
