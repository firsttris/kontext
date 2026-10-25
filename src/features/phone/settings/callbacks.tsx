/**
 * Firmenverwaltung → Telefonie → Verpasste Anrufe: on which board a missed call leaves the task
 * "Zurückrufen" (a person's own or a shared mailbox's); it is ticked off once someone talked to
 * the number again.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { send, useAdminChange } from "./api";
import { OwnerSelect } from "./owner-select";

export const CallbacksForm = ({ board }: { board: string | null }) => {
  const toast = useToast();
  const [chosen, setChosen] = useState(board ?? "");
  const save = useAdminChange(() => send("PUT", "/callbacks", { board: chosen || null }));
  return (
    <SettingsCard title={m.phone_callbacks()} description={m.phone_callbacks_hint()}>
      <Label>
        {m.phone_callbacks_board()}
        <OwnerSelect
          none={m.phone_callbacks_none()}
          value={chosen}
          onChange={(event) => setChosen(event.target.value)}
        />
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
