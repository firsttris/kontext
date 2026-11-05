/**
 * A person's working hours in the calendar: the day and week grids start there and shade the
 * hours outside. The default is the working day the appointment planning uses (availability.ts).
 */
import { WORKDAY } from "./availability";
import { weekDays } from "./jscalendar";

export type WorkHours = { startHour: number; endHour: number };

export const DEFAULT_WORK_HOURS: WorkHours = {
  startHour: WORKDAY.startHour,
  endHour: WORKDAY.endHour,
};

/** Stored as "7-18"; anything else, or a span that is empty, reads as the default. */
export const readWorkHours = (stored: string | null): WorkHours => {
  const match = /^(\d{1,2})-(\d{1,2})$/.exec(stored ?? "");
  const startHour = Number(match?.[1]);
  const endHour = Number(match?.[2]);
  return match && startHour < endHour && endHour <= 24
    ? { startHour, endHour }
    : DEFAULT_WORK_HOURS;
};

export const writeWorkHours = ({ startHour, endHour }: WorkHours): string =>
  `${startHour}-${endHour}`;

/** The parts of a day outside the working hours, in minutes from midnight. */
export const offHours = ({ startHour, endHour }: WorkHours): { top: number; bottom: number }[] =>
  [
    { top: 0, bottom: startHour * 60 },
    { top: endHour * 60, bottom: 24 * 60 },
  ].filter((part) => part.bottom > part.top);

const isWorkday = (day: string): boolean =>
  WORKDAY.weekdays.includes(new Date(`${day}T12:00:00Z`).getUTCDay());

/** Monday to Friday of the week around a day: the working days the planning uses too. */
export const workWeek = (day: string): string[] => weekDays(day).filter(isWorkday);
