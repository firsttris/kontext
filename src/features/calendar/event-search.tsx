/**
 * Found appointments, the coming ones first, then the past ones; a hit opens the appointment on
 * its day (a series on its first date). Laid out like the chat's search and the list view.
 */
import { Link } from "@tanstack/react-router";
import { Repeat } from "lucide-react";
import { useDeferredValue } from "react";
import { Highlighted } from "@/components/highlighted";
import {
  dateKey,
  eventKey,
  eventTimes,
  eventTitle,
  locationName,
  toLocal,
  ZONE,
} from "@/lib/jscalendar";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { calendarColor } from "./event-style";
import { eventSearch, useEventSearch } from "./queries";

const day = new Intl.DateTimeFormat(LOCALE, {
  weekday: "short",
  day: "numeric",
  month: "numeric",
  year: "numeric",
  timeZone: ZONE,
});

export const EventSearchResults = ({ words, onPick }: { words: string; onPick: () => void }) => {
  const query = useDeferredValue(words.trim());
  const { hits, isFetching } = useEventSearch(query);
  if (query.length < 2) {
    return <p className="m-0 px-5 py-3 text-[13px] text-muted">{m.chat_search_more()}</p>;
  }
  return (
    <ul
      aria-label={m.calendar_search_hits()}
      className="m-0 flex min-h-0 flex-1 list-none flex-col gap-px overflow-y-auto p-2 md:px-3"
    >
      {hits.length === 0 && !isFetching ? (
        <li className="px-2.5 py-3 text-[13px] text-muted">{m.mail_empty_search()}</li>
      ) : null}
      {hits.map((event) => {
        const { start, allDay } = eventTimes(event);
        const where = locationName(event);
        return (
          <li key={eventKey(event)}>
            <Link
              to="/calendar"
              search={(prev) => ({ ...prev, ...eventSearch(event), date: dateKey(start) })}
              onClick={onPick}
              className="flex items-start gap-3 rounded-lg px-2.5 py-2 text-fg no-underline hover:bg-hover"
            >
              <span
                aria-hidden="true"
                style={calendarColor(event)}
                className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--cal)]"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5 text-[14px] font-medium">
                  <span className="truncate">
                    <Highlighted
                      text={eventTitle(event, m.calendar_event_private())}
                      terms={[query]}
                    />
                  </span>
                  {event.recurrenceRule ? (
                    <Repeat
                      size={12}
                      className="shrink-0 text-muted"
                      aria-label={m.calendar_repeat()}
                    />
                  ) : null}
                </span>
                <span className="truncate text-[12px] text-muted">
                  <span className="font-mono">
                    {day.format(start)}
                    {allDay ? "" : ` ${toLocal(start).slice(11, 16)}`}
                  </span>
                  {where ? ` · ${where}` : ""}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
};
