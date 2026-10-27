/**
 * Create or edit an appointment. For one date of a series the user picks whether the change is
 * for that date only (Stalwart keeps it as an override) or for the whole series.
 */
import { type FormEvent, useState } from "react";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { MeetingField } from "@/features/calls/meeting-field";
import { useAddressSuggestions } from "@/features/contacts/use-suggestions";
import { EventDocuments } from "@/features/documents/document-actions";
import { useShareWith } from "@/features/documents/use-share-with";
import { RecipientField } from "@/features/mail/recipient-field";
import {
  attendeeEmails,
  type EventForm,
  eventToForm,
  type FormProblem,
  formToEvent,
  newEventForm,
  seriesStart,
  validateEventForm,
} from "@/lib/event-form";
import { type CalendarEvent, isInstance, toLocal } from "@/lib/jscalendar";
import { formAt, formSlot } from "@/lib/planning";
import { withNames } from "@/lib/suggestions";
import { m } from "@/paraglide/messages";
import { AvailabilityPanel } from "./availability-panel";
import { attendeeList } from "./availability-queries";
import { calendarLabel, useCalendarRefs, useEventMutations, useMyAddresses } from "./queries";
import { RepeatFields } from "./repeat-fields";

type Scope = "this" | "series";

const PROBLEMS: Record<Exclude<FormProblem, null>, () => string> = {
  title: m.calendar_event_title_missing,
  order: m.calendar_event_end_before_start,
  repeatEnd: m.calendar_repeat_end_invalid,
};

const startOf = (form: EventForm): string =>
  form.allDay ? `${form.date}T00:00:00` : `${form.date}T${form.startTime}:00`;

type Props = {
  event?: CalendarEvent;
  /** The series of an instance. */
  series?: CalendarEvent;
  start?: string;
  onDone: () => void;
  onCancel: () => void;
};

export const EventEditor = ({ event, series, start, onDone, onCancel }: Props) => {
  const { data: session } = useSession();
  const mine = useMyAddresses();
  const { create, update } = useEventMutations();
  const { calendars } = useCalendarRefs();
  const writable = calendars.filter((calendar) => calendar.mayWrite);
  const [calendarKey, setCalendarKey] = useState("");
  const target =
    writable.find((calendar) => calendar.key === calendarKey) ??
    writable.find((calendar) => calendar.isPersonal && calendar.calendar.isDefault) ??
    writable[0];
  const toast = useToast();
  const shareWith = useShareWith();
  const suggestions = useAddressSuggestions();
  const instance = event && isInstance(event) && series ? event : undefined;
  const [initial] = useState<EventForm>(() =>
    event
      ? eventToForm(event, mine, series)
      : newEventForm(`${start ?? `${toLocal(new Date()).slice(0, 11)}09:00`}:00`.slice(0, 19)),
  );
  const [form, setForm] = useState(initial);
  // Its old time is in the calendar of everyone it went to; planning leaves it out there.
  const [editing] = useState(() => {
    const slot = event ? formSlot(initial) : null;
    return slot
      ? {
          ...slot,
          invited: new Set([
            ...attendeeList(initial.attendees),
            ...mine.map((address) => address.toLowerCase()),
          ]),
        }
      : null;
  });
  const [scope, setScope] = useState<Scope>("this");
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof EventForm) => (e: { target: { value: string } }) =>
    setForm((current) => {
      const next = { ...current, [key]: e.target.value };
      // Moving the start keeps the length, like in every calendar.
      if (key === "date" && current.endDate === current.date) next.endDate = e.target.value;
      return next;
    });

  const save = (data: Record<string, unknown>) => {
    if (!event) {
      if (!target) throw new Error(m.calendar_calendar());
      return create.mutateAsync({ event: data, calendar: target });
    }
    if (!instance || scope === "this") return update.mutateAsync({ event, patch: data });
    // The whole series: its start moves by what this date moved.
    return update.mutateAsync({
      event,
      id: series!.id,
      patch: { ...data, start: seriesStart(series!.start, startOf(initial), startOf(form)) },
    });
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateEventForm(form);
    if (invalid) {
      setProblem(PROBLEMS[invalid]());
      return;
    }
    const forSeries = !instance || scope === "series";
    const data = formToEvent(
      form,
      { email: session?.username ?? "" },
      instance && scope === "series" ? series : event,
      forSeries,
    );
    try {
      await save(data);
      // The colleagues invited can open the appointment's documents.
      shareWith.event(
        attendeeEmails(form.attendees),
        form.documents.map((document) => document.id),
      );
      if (data.participants) toast.show(m.calendar_invite_sent());
      onDone();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {instance ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] text-muted">{m.calendar_scope()}</legend>
          {(
            [
              ["this", m.calendar_scope_this()],
              ["series", m.calendar_scope_series()],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-[14px]">
              <input
                type="radio"
                name="scope"
                value={value}
                checked={scope === value}
                onChange={() => setScope(value)}
                className="size-4 accent-[var(--accent)]"
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <Label>
        {m.calendar_event_title()}
        <Input value={form.title} onChange={set("title")} autoFocus />
      </Label>
      {!event && writable.length > 1 ? (
        <Label>
          {m.calendar_calendar()}
          <Select
            aria-label={m.calendar_calendar()}
            value={target?.key ?? ""}
            onChange={(e) => setCalendarKey(e.target.value)}
          >
            {writable.map((calendar) => (
              <option key={calendar.key} value={calendar.key}>
                {calendarLabel(calendar)}
              </option>
            ))}
          </Select>
        </Label>
      ) : null}
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={form.allDay}
          onChange={(e) => setForm((current) => ({ ...current, allDay: e.target.checked }))}
          className="size-4 accent-[var(--accent)]"
        />
        {m.calendar_event_all_day()}
      </label>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TimeFields
          legend={m.calendar_event_start()}
          date={form.date}
          time={form.startTime}
          allDay={form.allDay}
          onDate={set("date")}
          onTime={set("startTime")}
        />
        <TimeFields
          legend={m.calendar_event_end()}
          date={form.endDate}
          time={form.endTime}
          allDay={form.allDay}
          onDate={set("endDate")}
          onTime={set("endTime")}
        />
      </div>
      <RecipientField
        boxed
        label={m.calendar_event_attendees()}
        placeholder={m.calendar_event_attendees_hint()}
        value={withNames(attendeeEmails(form.attendees), suggestions)}
        onChange={(addresses) =>
          setForm((current) => ({
            ...current,
            attendees: addresses.map((address) => address.email).join(", "),
          }))
        }
        suggestions={suggestions}
      />
      <AvailabilityPanel
        form={form}
        editing={editing}
        onPick={(slot) => setForm((current) => formAt(current, slot))}
      />
      <Label>
        {m.calendar_event_show_as()}
        <Select
          value={form.showAs}
          onChange={(e) =>
            setForm((current) => ({ ...current, showAs: e.target.value as EventForm["showAs"] }))
          }
        >
          <option value="busy">{m.calendar_event_show_busy()}</option>
          <option value="free">{m.calendar_event_show_free()}</option>
        </Select>
      </Label>
      {!instance || scope === "series" ? (
        <RepeatFields
          value={form.recurrence}
          onChange={(recurrence) => setForm((current) => ({ ...current, recurrence }))}
        />
      ) : null}
      <Label>
        {m.calendar_event_location()}
        <Input value={form.location} onChange={set("location")} />
      </Label>
      <MeetingField
        meeting={form.meeting}
        description={form.description}
        onChange={(meeting, description) =>
          setForm((current) => ({ ...current, meeting, description }))
        }
      />
      <Label>
        {m.calendar_event_notes()}
        <Textarea value={form.description} onChange={set("description")} />
      </Label>
      <EventDocuments
        documents={form.documents}
        onChange={(documents) => setForm((current) => ({ ...current, documents }))}
      />
      {problem ? (
        <p role="alert" className="m-0 text-[13px] text-danger">
          {problem}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={create.isPending || update.isPending}>
          {m.calendar_event_save()}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {m.calendar_event_cancel()}
        </Button>
      </div>
    </form>
  );
};

type Change = (e: { target: { value: string } }) => void;

const TimeFields = ({
  legend,
  date,
  time,
  allDay,
  onDate,
  onTime,
}: {
  legend: string;
  date: string;
  time: string;
  allDay: boolean;
  onDate: Change;
  onTime: Change;
}) => (
  <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
    <legend className="mb-1.5 p-0 text-[13px] text-muted">{legend}</legend>
    <div className="flex gap-2">
      <Input
        type="date"
        aria-label={`${legend} ${m.calendar_event_date()}`}
        value={date}
        onChange={onDate}
        required
      />
      {!allDay ? (
        <Input
          type="time"
          aria-label={`${legend} Uhrzeit`}
          value={time}
          onChange={onTime}
          required
          className="w-32 shrink-0"
        />
      ) : null}
    </div>
  </fieldset>
);
