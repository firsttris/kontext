/**
 * Firmenverwaltung → Telefonie → Fax: one of the box's numbers takes faxes; each arrives as a PDF
 * mail in the chosen mailbox and stays at the call. A number of its own for faxes: in the Fritzbox
 * another IP phone that reacts to the fax number, entered under "Weitere Rufnummern".
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { type Admin, send, useAdminChange } from "./api";
import { OwnerSelect } from "./owner-select";

export const FaxForm = ({ admin }: { admin: Admin }) => {
  const toast = useToast();
  const [enabled, setEnabled] = useState(admin.fax.enabled);
  const [line, setLine] = useState(admin.fax.line);
  const [deliverTo, setDeliverTo] = useState(admin.fax.deliverTo ?? "");
  const save = useAdminChange(() =>
    send("PUT", "/fax", { enabled, line, deliverTo: deliverTo || null }),
  );
  const lines = [
    ...(admin.line ? [{ username: admin.line.username, label: m.phone_fax_first_line() }] : []),
    ...admin.extraLines.map((extra) => ({ username: extra.username, label: extra.label })),
  ];
  return (
    <SettingsCard title={m.phone_fax()} description={m.phone_fax_hint()}>
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        {m.phone_fax_enabled()}
      </label>
      <Label>
        {m.phone_fax_line()}
        <Select value={line} onChange={(event) => setLine(event.target.value)} disabled={!enabled}>
          <option value="">{m.phone_fax_choose()}</option>
          {lines.map((entry) => (
            <option key={entry.username} value={entry.username}>
              {entry.label}
            </option>
          ))}
        </Select>
      </Label>
      <Label>
        {m.phone_fax_deliver()}
        <OwnerSelect
          none={m.phone_mailbox_deliver_none()}
          value={deliverTo}
          onChange={(event) => setDeliverTo(event.target.value)}
          disabled={!enabled}
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
