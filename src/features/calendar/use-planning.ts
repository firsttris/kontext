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
import { formSlot, LOOKAHEAD_DAYS, planningRange, shownHours } from "@/lib/planning";
import { attendeeList, useSchedules } from "./availability-queries";

export type PlanningRow = Schedule & { name: string; isMe: boolean; status: PersonStatus };

/** The appointment before this change: its time and whom it went to (lower case). */
export type Editing = Slot & { invited: Set<string> };

/** `editing` sits in the calendars it was sent to and must not clash with itself. */
export const usePlanning = (form: EventForm, editing: Editing | null) => {
  const emails = attendeeList(form.attendees);
  const slot = formSlot(form);
  const [day, setDay] = useState(form.date);
  const [followed, setFollowed] = useState(form.date);
  // The day on screen follows the form's date when that changes.
  if (followed !== form.date) {
    setFollowed(form.date);
    setDay(form.date);
  }
  const range = planningRange(day, form.date, Date.now());
  const { schedules, names, me, isPending, isError } = useSchedules(
    emails,
    new Date(range.from),
    new Date(range.to),
  );
  const known = withoutEvent(schedules, editing);
  const rows: PlanningRow[] = known.map((schedule) => ({
    ...schedule,
    name: names[schedule.email] ?? schedule.email,
    isMe: schedule.email === me,
    status: slot ? statusDuring(schedule.busy, slot.start, slot.end) : { kind: "free" },
  }));
  const minutes = slot ? (slot.end - slot.start) / 60_000 : 60;
  const hours = shownHours(slot, day);
  return {
    day,
    showDay: setDay,
    rows,
    slot,
    /** Who is busy at the chosen time (tentative counts). */
    busyNow: rows.filter((row) => row.status.kind === "busy"),
    suggestions: freeSlots(known, range.suggestFrom, minutes, { days: LOOKAHEAD_DAYS }),
    hasAttendees: emails.length > 0,
    isPending,
    isError,
    hours,
  };
};

export type Planning = ReturnType<typeof usePlanning>;
