/**
 * Public holidays in the German states: the nine nationwide ones plus each state's own, as the
 * state laws on Sundays and holidays name them. Days that only some towns keep (Mariä Himmelfahrt
 * in Bavaria, Fronleichnam in parts of Saxony and Thuringia, the Augsburger Friedensfest) are left
 * out. Used by "Feiertage eintragen" in the calendar and in the phone's opening hours. Easter after
 * Gauß (Meeus/Jones/Butcher). Pure.
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

/** The Wednesday before 23 November (Buß- und Bettag). */
const repentanceDay = (year: number): string => {
  const weekday = new Date(`${year}-11-22T12:00:00Z`).getUTCDay();
  return plusDays(`${year}-11-22`, -((weekday + 4) % 7));
};

export const STATES = {
  BW: "Baden-Württemberg",
  BY: "Bayern",
  BE: "Berlin",
  BB: "Brandenburg",
  HB: "Bremen",
  HH: "Hamburg",
  HE: "Hessen",
  MV: "Mecklenburg-Vorpommern",
  NI: "Niedersachsen",
  NW: "Nordrhein-Westfalen",
  RP: "Rheinland-Pfalz",
  SL: "Saarland",
  SN: "Sachsen",
  ST: "Sachsen-Anhalt",
  SH: "Schleswig-Holstein",
  TH: "Thüringen",
} as const;

export type State = keyof typeof STATES;

export type Holiday = { day: string; name: string };

/** Which states keep a day; the nationwide ones have none. */
type Rule = { name: string; day: (year: number, easter: string) => string; states?: State[] };

const fixed = (monthDay: string) => (year: number) => `${year}-${monthDay}`;
const fromEaster = (days: number) => (_year: number, easter: string) => plusDays(easter, days);

const RULES: Rule[] = [
  { name: "Neujahr", day: fixed("01-01") },
  { name: "Heilige Drei Könige", day: fixed("01-06"), states: ["BW", "BY", "ST"] },
  { name: "Internationaler Frauentag", day: fixed("03-08"), states: ["BE", "MV"] },
  { name: "Karfreitag", day: fromEaster(-2) },
  { name: "Ostersonntag", day: fromEaster(0), states: ["BB", "HE"] },
  { name: "Ostermontag", day: fromEaster(1) },
  { name: "Tag der Arbeit", day: fixed("05-01") },
  { name: "Christi Himmelfahrt", day: fromEaster(39) },
  { name: "Pfingstsonntag", day: fromEaster(49), states: ["BB", "HE"] },
  { name: "Pfingstmontag", day: fromEaster(50) },
  { name: "Fronleichnam", day: fromEaster(60), states: ["BW", "BY", "HE", "NW", "RP", "SL"] },
  { name: "Mariä Himmelfahrt", day: fixed("08-15"), states: ["SL"] },
  { name: "Weltkindertag", day: fixed("09-20"), states: ["TH"] },
  { name: "Tag der Deutschen Einheit", day: fixed("10-03") },
  {
    name: "Reformationstag",
    day: fixed("10-31"),
    states: ["BB", "HB", "HH", "MV", "NI", "SN", "ST", "SH", "TH"],
  },
  { name: "Allerheiligen", day: fixed("11-01"), states: ["BW", "BY", "NW", "RP", "SL"] },
  { name: "Buß- und Bettag", day: repentanceDay, states: ["SN"] },
  { name: "1. Weihnachtstag", day: fixed("12-25") },
  { name: "2. Weihnachtstag", day: fixed("12-26") },
];

/** The public holidays of a year in a state, by date. */
export const holidays = (year: number, state: State): Holiday[] => {
  const easter = easterSunday(year);
  return RULES.filter((rule) => !rule.states || rule.states.includes(state))
    .map((rule) => ({ day: rule.day(year, easter), name: rule.name }))
    .sort((left, right) => left.day.localeCompare(right.day));
};

/** The holidays from today on for about a year: what the opening hours add. */
export const comingHolidays = (today: string, state: State = "BW"): Holiday[] => {
  const year = Number(today.slice(0, 4));
  const limit = plusDays(today, 366);
  return [...holidays(year, state), ...holidays(year + 1, state)].filter(
    (holiday) => holiday.day >= today && holiday.day < limit,
  );
};
