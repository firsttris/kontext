/**
 * Everything the planning panel shows for the editor's form: each attendee's status at the chosen
 * time, the busy periods of the day on screen, and the next times in which everyone is free.
 */
import { useState } from "react";
import {
  freeSlots,
  type PersonStatus,
  type Schedule,
  type Slot,
  statusDuring,
  withoutEvent,
} from "@/lib/availability";
import type { EventForm } from "@/lib/event-form";
import { addDays, fromLocal } from "@/lib/jscalendar";
import { formSlot, shownHours } from "@/lib/planning";
import { attendeeList, useSchedules } from "./availability-queries";

/** How far ahead the suggestions look. */
const LOOKAHEAD_DAYS = 14;

export type PlanningRow = Schedule & { name: string; isMe: boolean; status: PersonStatus };

const dayStart = (day: string) => fromLocal(`${day}T00:00:00`);

/**
 * `editing` is the appointment's time before the change: it sits in every attendee's calendar and
 * must not clash with itself.
 */
export const usePlanning = (form: EventForm, editing: Slot | null) => {
  const emails = attendeeList(form.attendees);
  const slot = formSlot(form);
  const [day, setDay] = useState(form.date);
  const [followed, setFollowed] = useState(form.date);
  // The day on screen follows the form's date when that changes.
  if (followed !== form.date) {
    setFollowed(form.date);
    setDay(form.date);
  }
  const [first = day, last = day] = [day, form.date].sort();
  const { schedules, names, me, isPending, isError } = useSchedules(
    emails,
    dayStart(first),
    dayStart(addDays(last, LOOKAHEAD_DAYS)),
  );
  const known = withoutEvent(schedules, editing);
  const rows: PlanningRow[] = known.map((schedule) => ({
    ...schedule,
    name: names[schedule.email] ?? schedule.email,
    isMe: schedule.email === me,
    status: slot ? statusDuring(schedule.busy, slot.start, slot.end) : { kind: "free" },
  }));
  const minutes = slot ? (slot.end - slot.start) / 60_000 : 60;
  const from = Math.max(Date.now(), dayStart(day).getTime());
  const hours = shownHours(slot, day);
  return {
    day,
    showDay: setDay,
    rows,
    slot,
    /** Who is busy at the chosen time (tentative counts). */
    busyNow: rows.filter((row) => row.status.kind === "busy"),
    suggestions: freeSlots(known, from, minutes, { days: LOOKAHEAD_DAYS }),
    hasAttendees: emails.length > 0,
    isPending,
    isError,
    hours,
    /** Where the bars begin: the first hour shown on that day. */
    dayStartMs: fromLocal(`${day}T${String(hours.startHour).padStart(2, "0")}:00:00`).getTime(),
  };
};

export type Planning = ReturnType<typeof usePlanning>;
