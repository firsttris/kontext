/**
 * An appointment as the dialog shows it: when, where, who, its documents, the answer buttons,
 * delete.
 */
import { CalendarDays, Copy, MapPin, Repeat, Users, Video } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { ItemLink, LinkIcon } from "@/features/links/item-link";
import { DOCUMENTS_ACCOUNT, documentsOfLinks } from "@/lib/document-links";
import {
  attendees,
  type CalendarEvent,
  eventTimes,
  isInstance,
  isOrganizer,
  locationName,
  meetingLink,
  myParticipation,
  participantEmail,
  toLocal,
} from "@/lib/jscalendar";
import { LOCALE } from "@/lib/locale";
import { mapsUrl } from "@/lib/maps";
import { describeRecurrence } from "@/lib/recurrence";
import { isFirstDate } from "@/lib/series-split";
import { m } from "@/paraglide/messages";
import {
  calendarLabel,
  calendarOf,
  mayEdit,
  useCalendarRefs,
  useEventMutations,
  useMyAddresses,
} from "./queries";
import { useSplitSeries } from "./split-series";

const longDay = new Intl.DateTimeFormat(LOCALE, {
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

type Props = {
  event: CalendarEvent;
  series: CalendarEvent | undefined;
  onEdit: () => void;
  /** Opens the editor with a copy; also for appointments the user may only read. */
  onDuplicate: () => void;
  onDone: () => void;
};

export const EventDetails = ({ event, series, onEdit, onDuplicate, onDone }: Props) => {
  const documents = documentsOfLinks(event.links);
  const mine = useMyAddresses();
  const { respond, remove } = useEventMutations();
  const split = useSplitSeries();
  const toast = useToast();
  const { start, end, allDay } = eventTimes(event);
  const { calendars } = useCalendarRefs();
  const calendar = calendarOf(calendars, event);
  // Answering is for the user's own calendar; in a colleague's it would answer for them.
  const me = calendar?.isPersonal ? myParticipation(event, mine) : undefined;
  const organizer = isOrganizer(event, mine);
  const editable = mayEdit(calendar, event, mine);
  const people = attendees(event);
  const repeats = describeRecurrence((series ?? event).recurrenceRule);
  const place = locationName(event);
  const inMaps = mapsUrl(place, navigator.userAgent);

  const run = async (action: () => Promise<unknown>, done?: () => void) => {
    try {
      await action();
      done?.();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const answer = (status: "accepted" | "declined" | "tentative") =>
    me && run(() => respond.mutateAsync({ event, participantId: me[0], status }));

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
      {calendar && calendars.length > 1 ? (
        <div className="flex items-start gap-3 text-[14px]">
          <span
            aria-hidden="true"
            className="mx-[3px] mt-[5px] size-2.5 shrink-0 rounded-full"
            style={{ background: calendar.color }}
          />
          <span className="flex flex-col">
            <span>
              {m.calendar_in({
                name: calendarLabel(calendar),
              })}
            </span>
            {!calendar.mayWrite ? (
              <span className="text-[13px] text-muted">
                {m.calendar_read_only({ owner: calendar.owner })}
              </span>
            ) : null}
          </span>
        </div>
      ) : null}
      {repeats ? (
        <div className="flex items-start gap-3 text-[14px]">
          <Repeat size={16} className="mt-0.5 shrink-0 text-muted" />
          <span>{repeats}</span>
        </div>
      ) : null}
      {place ? (
        <div className="flex items-start gap-3 text-[14px]">
          <MapPin size={16} className="mt-0.5 shrink-0 text-muted" />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="break-words">{place}</span>
            {inMaps ? (
              <a
                href={inMaps}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[13px] text-accent hover:underline"
              >
                {m.calendar_open_in_maps()}
              </a>
            ) : null}
          </span>
        </div>
      ) : null}
      {meetingLink(event) ? (
        <div className="flex items-center gap-3 text-[14px]">
          <Video size={16} className="shrink-0 text-muted" />
          <span className="flex-1">{m.meeting_label()}</span>
          <a
            href={meetingLink(event)}
            target="_blank"
            rel="noopener"
            className={buttonVariants({ variant: "primary", size: "sm" })}
          >
            {m.meeting_join()}
          </a>
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
      {documents.length ? (
        <ul aria-label={m.documents_linked()} className="m-0 flex list-none flex-col gap-1.5 p-0">
          {documents.map((document) => (
            <li key={document.id}>
              <ItemLink
                item={{ kind: "document", accountId: DOCUMENTS_ACCOUNT, ref: document.id }}
                className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[14px] text-fg no-underline hover:bg-hover"
              >
                <LinkIcon kind="document" size={14} />
                <span className="truncate">{document.name}</span>
              </ItemLink>
            </li>
          ))}
        </ul>
      ) : null}
      {me && !organizer ? (
        <fieldset aria-label="Antwort" className="m-0 flex gap-2 border-0 p-0">
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
        </fieldset>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {editable ? (
          <Button variant="primary" onClick={onEdit}>
            {m.contacts_edit()}
          </Button>
        ) : null}
        {calendars.some((ref) => ref.mayWrite) ? (
          <Button variant="outline" onClick={onDuplicate}>
            <Copy size={14} />
            {m.calendar_duplicate()}
          </Button>
        ) : null}
        <div className="flex-1" />
        {!calendar?.mayWrite ? null : isInstance(event) ? (
          <>
            <Button
              variant="outline"
              onClick={() => void run(() => remove.mutateAsync({ event }), onDone)}
            >
              {m.calendar_delete_this()}
            </Button>
            {series && !isFirstDate(series, event.recurrenceId!) ? (
              <Button
                variant="outline"
                onClick={() => void run(() => split.endBeforeDate(event, series), onDone)}
              >
                {m.calendar_delete_following()}
              </Button>
            ) : null}
            <Button
              variant="danger"
              onClick={() =>
                void run(() => remove.mutateAsync({ event, id: event.baseEventId! }), onDone)
              }
            >
              {m.calendar_delete_series()}
            </Button>
          </>
        ) : (
          <Button
            variant="danger"
            onClick={() => void run(() => remove.mutateAsync({ event }), onDone)}
          >
            {m.calendar_event_delete()}
          </Button>
        )}
      </div>
    </div>
  );
};
