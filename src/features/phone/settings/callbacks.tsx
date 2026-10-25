/**
 * Firmenverwaltung → Telefonie → Verpasste Anrufe: on which board a missed call leaves the task
 * "Zurückrufen" (a person's own or a shared mailbox's); it is ticked off once someone talked to
 * the number again.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useCompany } from "@/features/company/queries";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { send, useAdminChange } from "./api";

export const CallbacksForm = ({ board }: { board: string | null }) => {
  const toast = useToast();
  const { data: company } = useCompany();
  const [chosen, setChosen] = useState(board ?? "");
  const save = useAdminChange(() => send("PUT", "/callbacks", { board: chosen || null }));
  const people = (company?.employees ?? []).filter((employee) => employee.active);
  return (
    <SettingsCard title={m.phone_callbacks()} description={m.phone_callbacks_hint()}>
      <Label>
        {m.phone_callbacks_board()}
        <Select value={chosen} onChange={(event) => setChosen(event.target.value)}>
          <option value="">{m.phone_callbacks_none()}</option>
          {(company?.mailboxes ?? []).map((mailbox) => (
            <option key={mailbox.id} value={mailbox.id}>
              {mailbox.email}
            </option>
          ))}
          {people.map((employee) => (
            <option key={employee.id} value={employee.id}>
              {employee.fullName}
            </option>
          ))}
        </Select>
      </Label>
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
