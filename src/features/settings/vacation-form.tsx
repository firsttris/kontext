/**
 * The out-of-office fields; the own settings and the Firmenverwaltung save it differently. A
 * deputy is named in the text, a Vorlage of the Firmenverwaltung fills it
 * (src/lib/vacation-template.ts); the text stays free to edit either way.
 */
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useVacationTemplates } from "@/features/company/vacation-templates";
import { dateKey } from "@/lib/jscalendar";
import { LOCALE } from "@/lib/locale";
import { type VacationForm as Form, withDeputy } from "@/lib/vacation";
import { fillVacationTemplate, namesDeputy } from "@/lib/vacation-template";
import { m } from "@/paraglide/messages";

export type Colleague = { id: string; name: string; email: string };

/** The picked Vorlage: its text, and what it was filled to, to tell whether it was edited since. */
type Picked = { index: number; text: string; filled: string };

export const VacationForm = ({
  initial,
  onSave,
  saving,
  name,
  colleagues,
}: {
  initial: Form;
  onSave: (form: Form) => void;
  saving: boolean;
  /** The absent person's name, for {Name}. */
  name: string;
  /** Who can be named as the deputy. */
  colleagues: Colleague[];
}) => {
  const templates = useVacationTemplates();
  const [form, setForm] = useState<Form>(initial);
  const [deputyId, setDeputyId] = useState("");
  const [picked, setPicked] = useState<Picked | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: "from" | "subject" | "text") => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const deputyOf = (id: string) => colleagues.find((colleague) => colleague.id === id) ?? null;
  /** A Vorlage without {Vertretung} still gets the deputy, in the own line. */
  const fill = (text: string, next: Form, id: string) => {
    const deputy = deputyOf(id);
    const filled = fillVacationTemplate(text, { name, to: next.to, deputy, locale: LOCALE });
    return namesDeputy(text) ? filled : withDeputy(filled, deputy);
  };

  const pick = (index: number) => {
    const template = templates[index];
    if (!template) return setPicked(null);
    const filled = fill(template.text, form, deputyId);
    setPicked({ index, text: template.text, filled });
    setForm({ ...form, text: filled });
  };

  /**
   * A new end date or deputy: a Vorlage not edited since is filled anew; otherwise the deputy
   * gets the own line in the text, as without Vorlagen.
   */
  const change = (next: Form, id: string) => {
    if (picked && form.text === picked.filled) {
      const filled = fill(picked.text, next, id);
      setPicked({ ...picked, filled });
      setForm({ ...next, text: filled });
    } else if (id !== deputyId) {
      setForm({ ...next, text: withDeputy(next.text, deputyOf(id)) });
    } else {
      setForm(next);
    }
    setDeputyId(id);
  };

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
          <Input
            type="date"
            value={form.to}
            onChange={(e) => change({ ...form, to: e.target.value }, deputyId)}
          />
        </Label>
      </div>
      <Label>
        {m.company_deputy()}
        <Select value={deputyId} onChange={(e) => change(form, e.target.value)}>
          <option value="">{m.company_deputy_none()}</option>
          {colleagues.map((colleague) => (
            <option key={colleague.id} value={colleague.id}>
              {colleague.name}
            </option>
          ))}
        </Select>
      </Label>
      {templates.length ? (
        <Label>
          {m.vacation_template()}
          <Select
            value={picked?.index ?? ""}
            onChange={(e) => pick(e.target.value ? Number(e.target.value) : -1)}
          >
            <option value="">{m.vacation_template_own()}</option>
            {templates.map((template, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the Vorlagen have no ids
              <option key={index} value={index}>
                {template.title}
              </option>
            ))}
          </Select>
        </Label>
      ) : null}
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
