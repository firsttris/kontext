/**
 * The editor's planning panel, as pure functions: the form's chosen time, moving the form to a
 * suggested time, and how times and hours are shown.
 */
import { type Slot, WORKDAY, type Workday } from "./availability";
import type { EventForm } from "./event-form";
import { fromLocal, toLocal, ZONE } from "./jscalendar";

/** The chosen time of a timed form, or null while it is all day or ends before it starts. */
export const formSlot = (form: EventForm): Slot | null => {
  if (form.allDay) return null;
  const start = fromLocal(`${form.date}T${form.startTime}:00`).getTime();
  const end = fromLocal(`${form.endDate}T${form.endTime}:00`).getTime();
  return end > start ? { start, end } : null;
};

/** The form's date and times moved to a suggested slot. */
export const formAt = (form: EventForm, slot: Slot): EventForm => {
  const start = toLocal(new Date(slot.start));
  const end = toLocal(new Date(slot.end));
  return {
    ...form,
    date: start.slice(0, 10),
    startTime: start.slice(11, 16),
    endDate: end.slice(0, 10),
    endTime: end.slice(11, 16),
  };
};

/** "11:30" in the calendar's zone. */
export const clock = (time: number): string => toLocal(new Date(time)).slice(11, 16);

const weekday = new Intl.DateTimeFormat("de-DE", { weekday: "short", timeZone: ZONE });

/** "Mi" on the day shown, else with the date ("Mi 28.10."). */
const dayName = (time: number, day: string): string => {
  const local = toLocal(new Date(time));
  const name = weekday.format(new Date(time)).replace(".", "");
  return local.slice(0, 10) === day ? name : `${name} ${local.slice(8, 10)}.${local.slice(5, 7)}.`;
};

/** "11:30" on the day shown, else with weekday and date ("Mi 28.10. 09:00"). */
export const whenLabel = (time: number, day: string): string =>
  toLocal(new Date(time)).slice(0, 10) === day
    ? clock(time)
    : `${dayName(time, day)} ${clock(time)}`;

/** "Di 17:00–18:00", with the date when it is not the day shown ("Mi 28.10. 09:00–10:00"). */
export const slotLabel = (slot: Slot, day: string): string =>
  `${dayName(slot.start, day)} ${clock(slot.start)}–${clock(slot.end)}`;

/** The working day, widened to show a chosen time that lies outside it. */
export const shownHours = (slot: Slot | null, day: string): Workday => {
  const local = slot ? toLocal(new Date(slot.start)) : "";
  if (!slot || local.slice(0, 10) !== day) return WORKDAY;
  const startHour = Number(local.slice(11, 13));
  const end = toLocal(new Date(slot.end));
  const endHour =
    end.slice(0, 10) === day
      ? Math.ceil(Number(end.slice(11, 13)) + Number(end.slice(14, 16)) / 60)
      : 24;
  return {
    ...WORKDAY,
    startHour: Math.min(WORKDAY.startHour, startHour),
    endHour: Math.max(WORKDAY.endHour, endHour),
  };
};
