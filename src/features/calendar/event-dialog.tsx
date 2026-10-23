/** Show, answer, create and edit an appointment, in a dialog (a sheet on phones). */
import { useNavigate } from "@tanstack/react-router";
import { CalendarDays, MapPin, Users } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  attendees,
  type CalendarEvent,
  type EventForm,
  eventTimes,
  eventToForm,
  formToEvent,
  isOrganizer,
  locationName,
  myParticipation,
  newEventForm,
  participantEmail,
  toLocal,
  validateEventForm,
} from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { useEventMutations } from "./queries";

const longDay = new Intl.DateTimeFormat("de-DE", {
  timeZone: "Europe/Berlin",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

const statusLabel: Record<string, () => string> = {
  accepted: m.calendar_status_accepted,
  declined: m.calendar_status_declined,
  tentative: m.calendar_status_tentative,
  "needs-action": m.calendar_status_needs_action,
};

type Props = { eventId: string; event: CalendarEvent | undefined; start?: string };

export const EventDialog = ({ eventId, event, start }: Props) => {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(eventId === "new");
  const close = () =>
    navigate({
      to: "/calendar",
      search: (prev) => ({ ...prev, event: undefined, start: undefined }),
    });
  const isNew = eventId === "new";
  if (!isNew && !event) return null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
      title={isNew ? m.calendar_new() : editing ? (event?.title ?? "") : event?.title || "—"}
    >
      {editing ? (
        <EventEditor
          event={isNew ? undefined : event}
          start={start}
          onDone={close}
          onCancel={() => (isNew ? close() : setEditing(false))}
        />
      ) : (
        <EventDetails event={event!} onEdit={() => setEditing(true)} onDone={close} />
      )}
    </Dialog>
  );
};

const useMyAddresses = (): string[] => {
  const { data: session } = useSession();
  return session ? [session.username] : [];
};

const EventDetails = ({
  event,
  onEdit,
  onDone,
}: {
  event: CalendarEvent;
  onEdit: () => void;
  onDone: () => void;
}) => {
  const mine = useMyAddresses();
  const { respond, remove } = useEventMutations();
  const toast = useToast();
  const { start, end, allDay } = eventTimes(event);
  const me = myParticipation(event, mine);
  const organizer = isOrganizer(event, mine);
  const people = attendees(event);

  const answer = async (status: "accepted" | "declined" | "tentative") => {
    if (!me) return;
    try {
      await respond.mutateAsync({ id: event.id, participantId: me[0], status });
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const destroy = async () => {
    try {
      await remove.mutateAsync(event.id);
      onDone();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3 text-[14px]">
        <CalendarDays size={16} className="mt-0.5 shrink-0 text-muted" />
        <span>
          {longDay.format(start)}
          {allDay
            ? ` · ${m.calendar_all_day()}`
            : `, ${toLocal(start).slice(11, 16)}–${toLocal(end).slice(11, 16)}`}
        </span>
      </div>
      {locationName(event) ? (
        <div className="flex items-start gap-3 text-[14px]">
          <MapPin size={16} className="mt-0.5 shrink-0 text-muted" />
          <span>{locationName(event)}</span>
        </div>
      ) : null}
      {people.length > 0 ? (
        <div className="flex items-start gap-3 text-[14px]">
          <Users size={16} className="mt-0.5 shrink-0 text-muted" />
          <ul
            aria-label={m.calendar_event_attendees()}
            className="m-0 flex list-none flex-col gap-1 p-0"
          >
            {people.map(([id, person]) => (
              <li key={id} className="flex gap-2">
                <span>{person.name || participantEmail(person)}</span>
                <span className="text-muted">
                  {statusLabel[person.participationStatus ?? "needs-action"]?.() ?? ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {event.description ? (
        <p className="m-0 whitespace-pre-line text-[14px] text-muted">{event.description}</p>
      ) : null}
      {me && !organizer ? (
        <div role="group" aria-label="Antwort" className="flex gap-2">
          {(
            [
              ["accepted", m.calendar_accept()],
              ["tentative", m.calendar_tentative()],
              ["declined", m.calendar_decline()],
            ] as const
          ).map(([status, label]) => (
            <Button
              key={status}
              variant={me[1].participationStatus === status ? "primary" : "outline"}
              aria-pressed={me[1].participationStatus === status}
              className="flex-1"
              onClick={() => void answer(status)}
            >
              {label}
            </Button>
          ))}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {organizer ? (
          <Button variant="primary" onClick={onEdit}>
            {m.contacts_edit()}
          </Button>
        ) : null}
        <div className="flex-1" />
        <Button variant="danger" onClick={() => void destroy()}>
          {m.calendar_event_delete()}
        </Button>
      </div>
    </div>
  );
};

const EventEditor = ({
  event,
  start,
  onDone,
  onCancel,
}: {
  event?: CalendarEvent;
  start?: string;
  onDone: () => void;
  onCancel: () => void;
}) => {
  const { data: session } = useSession();
  const mine = useMyAddresses();
  const { create, update } = useEventMutations();
  const toast = useToast();
  const [form, setForm] = useState<EventForm>(() =>
    event
      ? eventToForm(event, mine)
      : newEventForm(`${start ?? `${toLocal(new Date()).slice(0, 11)}09:00`}:00`.slice(0, 19)),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const set = (key: keyof EventForm) => (e: { target: { value: string } }) =>
    setForm((current) => {
      const next = { ...current, [key]: e.target.value };
      // Moving the start keeps the length, like in every calendar.
      if (key === "date" && current.endDate === current.date) next.endDate = e.target.value;
      return next;
    });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateEventForm(form);
    if (invalid) {
      setProblem(
        invalid === "title"
          ? m.calendar_event_title_missing()
          : m.calendar_event_end_before_start(),
      );
      return;
    }
    const data = formToEvent(form, { email: session?.username ?? "" }, event);
    try {
      if (event) await update.mutateAsync({ id: event.id, patch: data });
      else await create.mutateAsync(data);
      if (data.participants) toast.show(m.calendar_invite_sent());
      onDone();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Label>
        {m.calendar_event_title()}
        <Input value={form.title} onChange={set("title")} autoFocus />
      </Label>
      <label className="flex items-center gap-2 text-[14px]">
        <input
          type="checkbox"
          checked={form.allDay}
          onChange={(e) => setForm((current) => ({ ...current, allDay: e.target.checked }))}
          className="size-4 accent-[var(--accent)]"
        />
        {m.calendar_event_all_day()}
      </label>
      <div className="grid grid-cols-1 gap-3">
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] text-muted">{m.calendar_event_start()}</legend>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label={`${m.calendar_event_start()} ${m.calendar_event_date()}`}
              value={form.date}
              onChange={set("date")}
              required
            />
            {!form.allDay ? (
              <Input
                type="time"
                aria-label={`${m.calendar_event_start()} Uhrzeit`}
                value={form.startTime}
                onChange={set("startTime")}
                required
                className="w-32 shrink-0"
              />
            ) : null}
          </div>
        </fieldset>
        <fieldset className="m-0 flex flex-col gap-1.5 border-0 p-0">
          <legend className="mb-1.5 p-0 text-[13px] text-muted">{m.calendar_event_end()}</legend>
          <div className="flex gap-2">
            <Input
              type="date"
              aria-label={`${m.calendar_event_end()} ${m.calendar_event_date()}`}
              value={form.endDate}
              onChange={set("endDate")}
              required
            />
            {!form.allDay ? (
              <Input
                type="time"
                aria-label={`${m.calendar_event_end()} Uhrzeit`}
                value={form.endTime}
                onChange={set("endTime")}
                required
                className="w-32 shrink-0"
              />
            ) : null}
          </div>
        </fieldset>
      </div>
      <Label>
        {m.calendar_event_location()}
        <Input value={form.location} onChange={set("location")} />
      </Label>
      <Label>
        {m.calendar_event_attendees()}
        <Input
          value={form.attendees}
          onChange={set("attendees")}
          placeholder={m.calendar_event_attendees_hint()}
        />
      </Label>
      <Label>
        {m.calendar_event_notes()}
        <Textarea value={form.description} onChange={set("description")} />
      </Label>
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
