/**
 * "Geburtstage": the contacts' birthdays as a calendar of their own, computed in the browser from
 * the address books the user can see (lib/birthdays.ts). Read-only; a click opens the contact.
 * Shown unless switched off under "Meine Kalender" ("birthdays" in the hidden calendars).
 */
import { useMemo } from "react";
import { type BirthdayEvent, birthdayEvent, birthdaysBetween } from "@/lib/birthdays";
import { m } from "@/paraglide/messages";
import { useContacts } from "../contacts/queries";
import { setCalendarHidden, useHiddenCalendars } from "./hidden-calendars";

const BIRTHDAYS_KEY = "birthdays";

/** Its colour, apart from the palette of the server's calendars. */
const BIRTHDAY_COLOR = "#e11d74";

export const useBirthdaysShown = (): boolean => !useHiddenCalendars().has(BIRTHDAYS_KEY);

/** The birthdays of the days `from` … `to` (inclusive); none while the calendar is hidden. */
export const useBirthdayEvents = (from: string, to: string): BirthdayEvent[] => {
  const shown = useBirthdaysShown();
  const { data: contacts } = useContacts();
  return useMemo(
    () =>
      shown
        ? birthdaysBetween(contacts, from, to).map((birthday) =>
            birthdayEvent(birthday, BIRTHDAY_COLOR),
          )
        : [],
    [shown, contacts, from, to],
  );
};

/** The box to show or hide the birthdays, below the own calendars. */
export const BirthdaysToggle = () => {
  const shown = useBirthdaysShown();
  return (
    <label className="flex min-h-8 cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={shown}
        aria-label={m.calendar_show({ name: m.calendar_birthdays() })}
        onChange={(e) => setCalendarHidden(BIRTHDAYS_KEY, !e.target.checked)}
        className="size-4 shrink-0"
        style={{ accentColor: BIRTHDAY_COLOR }}
      />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{m.calendar_birthdays()}</span>
        <span className="truncate text-[12px] text-muted">{m.calendar_birthdays_hint()}</span>
      </span>
    </label>
  );
};
