/**
 * Microsoft Graph's contacts and events as JSContact (RFC 9553) and JSCalendar (RFC 8984), the
 * way Kontext writes them itself (src/lib/jscontact.ts, src/lib/recurrence.ts). Graph resources:
 * https://learn.microsoft.com/graph/api/resources/contact and .../event, .../patternedrecurrence.
 * Pure functions.
 */

export type GraphContact = {
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  companyName?: string | null;
  jobTitle?: string | null;
  emailAddresses?: { address?: string | null; name?: string | null }[];
  businessPhones?: string[];
  homePhones?: string[];
  mobilePhone?: string | null;
  businessAddress?: GraphAddress | null;
  homeAddress?: GraphAddress | null;
  personalNotes?: string | null;
};
type GraphAddress = {
  street?: string | null;
  city?: string | null;
  postalCode?: string | null;
  countryOrRegion?: string | null;
};

const keyed = <T>(prefix: string, items: T[]): Record<string, T> | undefined =>
  items.length ? Object.fromEntries(items.map((item, i) => [`${prefix}${i}`, item])) : undefined;

const address = (value: GraphAddress | null | undefined, context: string) => {
  const components = [
    value?.street ? { kind: "name", value: value.street } : null,
    value?.postalCode ? { kind: "postcode", value: value.postalCode } : null,
    value?.city ? { kind: "locality", value: value.city } : null,
    value?.countryOrRegion ? { kind: "country", value: value.countryOrRegion } : null,
  ].filter((c): c is { kind: string; value: string } => c !== null);
  return components.length ? { components, contexts: { [context]: true } } : null;
};

export const contactToCard = (contact: GraphContact): Record<string, unknown> => {
  const components = [
    contact.givenName ? { kind: "given", value: contact.givenName } : null,
    contact.surname ? { kind: "surname", value: contact.surname } : null,
  ].filter((c): c is { kind: string; value: string } => c !== null);
  const name = components.length
    ? { components, isOrdered: true }
    : { full: contact.displayName || contact.companyName || "" };
  const phones = [
    ...(contact.businessPhones ?? []).map((number) => ({
      number,
      features: { voice: true },
      contexts: { work: true },
    })),
    ...(contact.mobilePhone ? [{ number: contact.mobilePhone, features: { mobile: true } }] : []),
    ...(contact.homePhones ?? []).map((number) => ({
      number,
      features: { voice: true },
      contexts: { private: true },
    })),
  ];
  const addresses = [
    address(contact.businessAddress, "work"),
    address(contact.homeAddress, "private"),
  ].filter((a) => a !== null);
  return {
    kind: "individual",
    name,
    emails: keyed(
      "e",
      (contact.emailAddresses ?? []).flatMap((e) => (e.address ? [{ address: e.address }] : [])),
    ),
    phones: keyed("p", phones),
    organizations: contact.companyName ? { o0: { name: contact.companyName } } : undefined,
    titles: contact.jobTitle ? { t0: { name: contact.jobTitle } } : undefined,
    addresses: keyed("a", addresses),
    notes: contact.personalNotes ? { n0: { note: contact.personalNotes } } : undefined,
  };
};

export type GraphEvent = {
  iCalUId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  body?: { contentType?: string; content?: string } | null;
  start: { dateTime: string; timeZone?: string };
  end: { dateTime: string; timeZone?: string };
  isAllDay?: boolean;
  showAs?: string | null;
  location?: { displayName?: string | null } | null;
  recurrence?: GraphRecurrence | null;
  type?: string;
};
export type GraphRecurrence = {
  pattern: {
    type:
      | "daily"
      | "weekly"
      | "absoluteMonthly"
      | "relativeMonthly"
      | "absoluteYearly"
      | "relativeYearly";
    interval?: number;
    daysOfWeek?: string[];
    dayOfMonth?: number;
    month?: number;
    index?: "first" | "second" | "third" | "fourth" | "last";
  };
  range: {
    type: "endDate" | "noEnd" | "numbered";
    startDate?: string;
    endDate?: string;
    numberOfOccurrences?: number;
  };
};

const DAYS: Record<string, string> = {
  monday: "mo",
  tuesday: "tu",
  wednesday: "we",
  thursday: "th",
  friday: "fr",
  saturday: "sa",
  sunday: "su",
};
const NTH: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, last: -1 };

export const recurrenceToRule = ({ pattern, range }: GraphRecurrence): Record<string, unknown> => {
  const byDay = (pattern.daysOfWeek ?? []).map((day) => ({
    day: DAYS[day.toLowerCase()] ?? day.slice(0, 2),
    ...(pattern.index && pattern.type.startsWith("relative")
      ? { nthOfPeriod: NTH[pattern.index] }
      : {}),
  }));
  const frequency = {
    daily: "daily",
    weekly: "weekly",
    absoluteMonthly: "monthly",
    relativeMonthly: "monthly",
    absoluteYearly: "yearly",
    relativeYearly: "yearly",
  }[pattern.type];
  return {
    "@type": "RecurrenceRule",
    frequency,
    ...((pattern.interval ?? 1) > 1 ? { interval: pattern.interval } : {}),
    ...(byDay.length && pattern.type !== "daily" ? { byDay } : {}),
    ...(pattern.type.startsWith("absolute") && pattern.dayOfMonth
      ? { byMonthDay: [pattern.dayOfMonth] }
      : {}),
    ...(pattern.type.endsWith("Yearly") && pattern.month
      ? { byMonth: [String(pattern.month)] }
      : {}),
    ...(range.type === "numbered" && range.numberOfOccurrences
      ? { count: range.numberOfOccurrences }
      : {}),
    ...(range.type === "endDate" && range.endDate ? { until: `${range.endDate}T23:59:59` } : {}),
  };
};

/** "2026-11-05T08:00:00.0000000" → "2026-11-05T08:00:00" (Graph's local time, no zone). */
const localTime = (value: string) => value.slice(0, 19);

/** The length from start to end as an ISO 8601 duration ("PT1H30M", "P2D"). */
export const durationBetween = (start: string, end: string, wholeDays: boolean): string => {
  const ms = Date.parse(`${localTime(end)}Z`) - Date.parse(`${localTime(start)}Z`);
  if (wholeDays) return `P${Math.max(1, Math.round(ms / 86_400_000))}D`;
  const minutes = Math.max(0, Math.round(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  const time = `${hours ? `${hours}H` : ""}${rest ? `${rest}M` : ""}`;
  return `P${days ? `${days}D` : ""}${time ? `T${time}` : days ? "" : "T0S"}`;
};

const textOf = (event: GraphEvent): string => {
  const body = event.body;
  if (!body?.content) return event.bodyPreview ?? "";
  if (body.contentType?.toLowerCase() !== "html") return body.content.trim();
  return body.content
    .replace(/<(br|\/p|\/div)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

/**
 * An event read with `Prefer: outlook.timezone="W. Europe Standard Time"`, so its times are local
 * German times. Changed single dates of a series are not part of the series master.
 */
export const eventToJSCalendar = (event: GraphEvent, timeZone: string): Record<string, unknown> => {
  const allDay = Boolean(event.isAllDay);
  const description = textOf(event);
  return {
    "@type": "Event",
    title: event.subject ?? "",
    ...(description ? { description } : {}),
    start: allDay
      ? `${event.start.dateTime.slice(0, 10)}T00:00:00`
      : localTime(event.start.dateTime),
    ...(allDay ? { showWithoutTime: true } : { timeZone }),
    duration: durationBetween(event.start.dateTime, event.end.dateTime, allDay),
    ...(event.location?.displayName
      ? { locations: { l0: { "@type": "Location", name: event.location.displayName } } }
      : {}),
    ...(event.recurrence ? { recurrenceRule: recurrenceToRule(event.recurrence) } : {}),
    ...(event.showAs === "free" ? { freeBusyStatus: "free" } : {}),
  };
};

/** Graph's well-known folders (they work in every language) and where they land. */
export const WELL_KNOWN: Record<string, string | null> = {
  inbox: "inbox",
  sentitems: "sent",
  drafts: "drafts",
  archive: "archive",
  deleteditems: null,
  junkemail: null,
  outbox: null,
  conversationhistory: null,
  syncissues: null,
  conflicts: null,
  localfailures: null,
  serverfailures: null,
  clutter: null,
  scheduled: null,
};
