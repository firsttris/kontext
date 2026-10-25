/**
 * Opening hours as the Firmenverwaltung edits them – a row per weekday, Monday first, with up to
 * two ranges (before and after lunch) – and as the box gets them: a flat list of ranges with
 * Asterisk's day numbers (Sunday 0). Pure.
 */

export type OpenRange = { day: number; from: string; to: string };
export type Span = { from: string; to: string };
export type WeekRow = { day: number; open: boolean; first: Span; second: Span | null };

/** Monday to Sunday, in Asterisk's numbering. */
export const WEEK = [1, 2, 3, 4, 5, 6, 0] as const;

const DEFAULT_FIRST: Span = { from: "08:00", to: "12:00" };
const DEFAULT_SECOND: Span = { from: "13:00", to: "17:00" };

export const toWeek = (open: OpenRange[]): WeekRow[] =>
  WEEK.map((day) => {
    const ranges = open
      .filter((range) => range.day === day)
      .sort((left, right) => left.from.localeCompare(right.from));
    return {
      day,
      open: ranges.length > 0,
      first: ranges[0] ? { from: ranges[0].from, to: ranges[0].to } : DEFAULT_FIRST,
      second: ranges[1] ? { from: ranges[1].from, to: ranges[1].to } : null,
    };
  });

export const fromWeek = (rows: WeekRow[]): OpenRange[] =>
  rows
    .filter((row) => row.open)
    .flatMap((row) =>
      [row.first, ...(row.second ? [row.second] : [])].map((span) => ({ day: row.day, ...span })),
    );

/** What one gets on switching the hours on: Monday to Friday, 8–12 and 13–17. */
export const usualWeek = (): WeekRow[] =>
  WEEK.map((day) => ({
    day,
    open: day >= 1 && day <= 5,
    first: DEFAULT_FIRST,
    second: day >= 1 && day <= 5 ? DEFAULT_SECOND : null,
  }));
