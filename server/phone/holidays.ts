/**
 * Public holidays in Baden-Württemberg (where the first customers are), for "Feiertage
 * eintragen" in the opening hours: the nine nationwide ones plus Heilige Drei Könige,
 * Fronleichnam and Allerheiligen. Easter after Gauß (Meeus/Jones/Butcher). Pure.
 */

/** Easter Sunday of a year, as "YYYY-MM-DD". */
export const easterSunday = (year: number): string => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
};

const plusDays = (day: string, days: number) => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

export type Holiday = { day: string; name: string };

export const holidaysBW = (year: number): Holiday[] => {
  const easter = easterSunday(year);
  const fixed = (monthDay: string, name: string) => ({ day: `${year}-${monthDay}`, name });
  return [
    fixed("01-01", "Neujahr"),
    fixed("01-06", "Heilige Drei Könige"),
    { day: plusDays(easter, -2), name: "Karfreitag" },
    { day: plusDays(easter, 1), name: "Ostermontag" },
    fixed("05-01", "Tag der Arbeit"),
    { day: plusDays(easter, 39), name: "Christi Himmelfahrt" },
    { day: plusDays(easter, 50), name: "Pfingstmontag" },
    { day: plusDays(easter, 60), name: "Fronleichnam" },
    fixed("10-03", "Tag der Deutschen Einheit"),
    fixed("11-01", "Allerheiligen"),
    fixed("12-25", "1. Weihnachtstag"),
    fixed("12-26", "2. Weihnachtstag"),
  ].sort((left, right) => left.day.localeCompare(right.day));
};

/** The holidays from today on for about a year: what "Feiertage eintragen" adds. */
export const comingHolidays = (today: string): Holiday[] => {
  const year = Number(today.slice(0, 4));
  const limit = plusDays(today, 366);
  return [...holidaysBW(year), ...holidaysBW(year + 1)].filter(
    (holiday) => holiday.day >= today && holiday.day < limit,
  );
};
