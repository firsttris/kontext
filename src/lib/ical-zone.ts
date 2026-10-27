/**
 * A VTIMEZONE (RFC 5545 §3.6.5) for an IANA zone, read from the browser's own time zone data:
 * every TZID an invitation names needs one, and Outlook goes by it rather than by the name. The
 * changes between standard and summer time are found by asking Intl for the offset; where they
 * follow one rule over the years ("last Sunday in March, 02:00"), they become a yearly RRULE,
 * otherwise each change is listed. Pure.
 */

const YEARS_AROUND = 2;
const MINUTE = 60_000;
const DAY = 86_400_000;
const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Minutes east of UTC in the zone at the instant ("GMT+01:00" → 60). */
export const offsetAt = (zone: string, at: Date): number => {
  let format = formatters.get(zone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" });
    formatters.set(zone, format);
  }
  const name = format.formatToParts(at).find((part) => part.type === "timeZoneName")?.value ?? "";
  const match = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "-" ? -minutes : minutes;
};

type Change = { at: number; from: number; to: number };

/** The first minute in (low, high] with the new offset. */
const changeMinute = (zone: string, low: number, high: number): number => {
  const before = offsetAt(zone, new Date(low));
  let [lo, hi] = [low, high];
  while (hi - lo > MINUTE) {
    const mid = lo + Math.floor((hi - lo) / 2 / MINUTE) * MINUTE;
    if (offsetAt(zone, new Date(mid)) === before) lo = mid;
    else hi = mid;
  }
  return hi;
};

/** The offset changes of the zone in the years, found day by day, then to the minute. */
export const changesIn = (zone: string, fromYear: number, toYear: number): Change[] => {
  const changes: Change[] = [];
  const end = Date.UTC(toYear + 1, 0, 1);
  let at = Date.UTC(fromYear, 0, 1);
  let offset = offsetAt(zone, new Date(at));
  for (; at < end; at += DAY) {
    const next = offsetAt(zone, new Date(at + DAY));
    if (next === offset) continue;
    changes.push({ at: changeMinute(zone, at, at + DAY), from: offset, to: next });
    offset = next;
  }
  return changes;
};

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, "0");

/** "+0100", "-0330". */
const offsetText = (minutes: number) =>
  `${minutes < 0 ? "-" : "+"}${pad(Math.trunc(Math.abs(minutes) / 60))}${pad(Math.abs(minutes) % 60)}`;

/** The change as the clock showed it before (DTSTART of an observance is in the old offset). */
const localBefore = (change: Change) => new Date(change.at + change.from * MINUTE);

const localText = (local: Date) =>
  `${local.getUTCFullYear()}${pad(local.getUTCMonth() + 1)}${pad(local.getUTCDate())}T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00`;

/** "BYMONTH=3;BYDAY=-1SU": the rule a change follows, by month, weekday and week. */
const ruleOf = (change: Change): string => {
  const local = localBefore(change);
  const day = local.getUTCDate();
  const length = new Date(
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const week = day + 7 > length ? -1 : Math.ceil(day / 7);
  const time = localText(local).slice(9);
  return `BYMONTH=${local.getUTCMonth() + 1};BYDAY=${week}${WEEKDAYS[local.getUTCDay()]}|${time}`;
};

const observance = (kind: "STANDARD" | "DAYLIGHT", change: Change, rrule?: string) => [
  `BEGIN:${kind}`,
  `DTSTART:${localText(localBefore(change))}`,
  ...(rrule ? [`RRULE:FREQ=YEARLY;${rrule}`] : []),
  `TZOFFSETFROM:${offsetText(change.from)}`,
  `TZOFFSETTO:${offsetText(change.to)}`,
  `END:${kind}`,
];

/** The changes of one kind: one with a yearly rule when they all follow it, else each one. */
const observances = (kind: "STANDARD" | "DAYLIGHT", changes: Change[]): string[] => {
  if (!changes.length) return [];
  const rules = new Set(changes.map(ruleOf));
  if (rules.size === 1) {
    const [rule = ""] = [...rules];
    return observance(kind, changes[0]!, rule.split("|")[0]);
  }
  return changes.flatMap((change) => observance(kind, change));
};

/**
 * The VTIMEZONE lines for the zone, around the year of the event: for a few years before and
 * after, which covers an event and a series that follows the same rule on.
 */
export const vtimezone = (zone: string, year: number): string[] => {
  const changes = changesIn(zone, year - YEARS_AROUND, year + YEARS_AROUND);
  const fixed = offsetText(offsetAt(zone, new Date(Date.UTC(year, 0, 1))));
  const body = changes.length
    ? [
        ...observances(
          "DAYLIGHT",
          changes.filter((change) => change.to > change.from),
        ),
        ...observances(
          "STANDARD",
          changes.filter((change) => change.to < change.from),
        ),
      ]
    : [
        "BEGIN:STANDARD",
        "DTSTART:19700101T000000",
        `TZOFFSETFROM:${fixed}`,
        `TZOFFSETTO:${fixed}`,
        "END:STANDARD",
      ];
  return ["BEGIN:VTIMEZONE", `TZID:${zone}`, ...body, "END:VTIMEZONE"];
};
