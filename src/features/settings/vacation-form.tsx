/** The out-of-office fields; the own settings and the Firmenverwaltung save it differently. */
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { dateKey } from "@/lib/jscalendar";
import type { VacationForm as Form } from "@/lib/vacation";
import { m } from "@/paraglide/messages";

export const VacationForm = ({
  initial,
  onSave,
  saving,
  extra,
}: {
  initial: Form;
  onSave: (form: Form) => void;
  saving: boolean;
  /** Fields between the dates and the subject, e.g. the deputy; may change the form. */
  extra?: (form: Form, setForm: (form: Form) => void) => ReactNode;
}) => {
  const [form, setForm] = useState<Form>(initial);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof Form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (form.from && form.to && form.to < form.from) {
      setProblem(m.calendar_event_end_before_start());
      return;
    }
    setProblem(null);
    onSave(form);
  };

  return (
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
      {extra?.(form, setForm)}
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
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
      <Button type="submit" variant="primary" className="self-start" disabled={saving}>
        {m.contacts_save()}
      </Button>
    </form>
  );
};
