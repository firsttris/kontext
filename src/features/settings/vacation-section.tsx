/** The automatic out-of-office reply (RFC 8621 VacationResponse), optionally limited to dates. */
import { type FormEvent, useEffect, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { setVacation } from "@/jmap/settings";
import { htmlToText, textToHtml } from "@/lib/html";
import { addDays, dateKey, fromLocal } from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { usePersonalAccountId, useSave, useVacation } from "./queries";
import { SettingsCard } from "./settings-page";

type Form = { isEnabled: boolean; from: string; to: string; subject: string; text: string };

/** The last day of an absence is inclusive; JMAP's toDate is the moment it ends. */
const toInstant = (day: string, endOfDay: boolean): string | null =>
  day ? fromLocal(`${endOfDay ? addDays(day, 1) : day}T00:00:00`).toISOString() : null;

const fromInstant = (iso: string | null, endOfDay: boolean): string =>
  iso ? dateKey(new Date(new Date(iso).getTime() - (endOfDay ? 1 : 0))) : "";

export const VacationSection = () => {
  const client = useClient();
  const toast = useToast();
  const accountId = usePersonalAccountId();
  const { data: vacation } = useVacation();
  const [form, setForm] = useState<Form>({
    isEnabled: false,
    from: "",
    to: "",
    subject: "",
    text: "",
  });

  useEffect(() => {
    if (!vacation) return;
    setForm({
      isEnabled: vacation.isEnabled,
      from: fromInstant(vacation.fromDate, false),
      to: fromInstant(vacation.toDate, true),
      subject: vacation.subject ?? "",
      text: vacation.textBody ?? (vacation.htmlBody ? htmlToText(vacation.htmlBody) : ""),
    });
  }, [vacation]);

  const save = useSave(
    (value: Form) =>
      setVacation(client, accountId!, {
        isEnabled: value.isEnabled,
        fromDate: toInstant(value.from, false),
        toDate: toInstant(value.to, true),
        subject: value.subject.trim() || null,
        textBody: value.text.trim() || null,
        htmlBody: value.text.trim() ? textToHtml(value.text.trim()) : null,
      }),
    [[accountId, "vacation"]],
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.from && form.to && form.to < form.from) {
      toast.show(m.calendar_event_end_before_start(), "error");
      return;
    }
    try {
      await save.mutateAsync(form);
      toast.show(form.isEnabled ? m.settings_vacation_on() : m.settings_saved());
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const set = (key: keyof Form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <SettingsCard title={m.settings_vacation()} description={m.settings_vacation_hint()}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <label className="flex items-center gap-2.5 text-[15px] font-medium">
          <input
            type="checkbox"
            checked={form.isEnabled}
            onChange={(e) => setForm((current) => ({ ...current, isEnabled: e.target.checked }))}
            className="size-4 accent-[var(--accent)]"
          />
          {m.settings_vacation_enable()}
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Label>
            {m.settings_vacation_from()}
            <Input type="date" value={form.from} onChange={set("from")} min={dateKey(new Date())} />
          </Label>
          <Label>
            {m.settings_vacation_to()}
            <Input type="date" value={form.to} onChange={set("to")} />
          </Label>
        </div>
        <Label>
          {m.mail_subject()}
          <Input
            value={form.subject}
            onChange={set("subject")}
            placeholder={m.settings_vacation_subject_placeholder()}
          />
        </Label>
        <Label>
          {m.settings_vacation_message()}
          <Textarea
            value={form.text}
            onChange={set("text")}
            rows={6}
            placeholder={m.settings_vacation_message_placeholder()}
          />
        </Label>
        <Button type="submit" variant="primary" className="self-start" disabled={save.isPending}>
          {m.contacts_save()}
        </Button>
      </form>
    </SettingsCard>
  );
};
