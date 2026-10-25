/**
 * Firmenverwaltung → Telefonie → Sperrliste: numbers the box turns away before anything rings
 * (added here or with "Sperren" in the call list), and withheld numbers if wanted.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { SettingsCard } from "@/features/settings/settings-page";
import { readableNumber } from "@/lib/phone";
import { m } from "@/paraglide/messages";
import { type Admin, send, useAdminChange } from "./api";

export const BlockedForm = ({ blocked }: { blocked: Admin["blocked"] }) => {
  const toast = useToast();
  const [numbers, setNumbers] = useState(blocked.numbers.map((entry) => entry.number));
  const [anonymous, setAnonymous] = useState(blocked.anonymous);
  const [number, setNumber] = useState("");
  const save = useAdminChange(() => send("PUT", "/blocked", { numbers, anonymous }));
  return (
    <SettingsCard title={m.phone_blocklist()} description={m.phone_blocklist_hint()}>
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={anonymous}
          onChange={(event) => setAnonymous(event.target.checked)}
          className="size-4 accent-[var(--accent)]"
        />
        {m.phone_blocklist_anonymous()}
      </label>
      {numbers.length ? (
        <ul aria-label={m.phone_blocklist()} className="m-0 flex list-none flex-col gap-1 p-0">
          {numbers.map((entry) => (
            <li key={entry} className="flex items-center gap-2 text-[14px]">
              <span className="flex-1 font-mono">{readableNumber(entry)}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setNumbers((current) => current.filter((other) => other !== entry))}
              >
                {m.phone_blocklist_lift()}
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (number.trim()) setNumbers((current) => [...current, number.trim()]);
          setNumber("");
        }}
      >
        <Label className="min-w-0 flex-1">
          {m.phone_blocklist_number()}
          <Input
            value={number}
            onChange={(event) => setNumber(event.target.value)}
            inputMode="tel"
          />
        </Label>
        <Button type="submit" disabled={!number.trim()}>
          {m.phone_hours_add()}
        </Button>
      </form>
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
