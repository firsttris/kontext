/**
 * Free and busy times in the company, like Outlook's default: every colleague may see when
 * someone is busy, without titles. A calendar shows it through `shareWith` with `mayReadFreeBusy`
 * (draft-ietf-jmap-calendars; Stalwart crates/jmap/src/principal/availability.rs checks it per
 * calendar). Pure functions; Kontext's own app keeps the same rights in src/lib/sharing.ts.
 */

export type CalendarRights = Partial<Record<string, boolean>>;
export type CalendarShare = { id: string; shareWith: Record<string, CalendarRights> | null };

/** Free and busy times only (the app's "Nur Verfügbarkeit"). */
export const FREE_BUSY: CalendarRights = {
  mayReadFreeBusy: true,
  mayReadItems: false,
  mayWriteAll: false,
  mayWriteOwn: false,
  mayUpdatePrivate: false,
  mayRSVP: false,
  mayDelete: false,
  mayShare: false,
};

/** Calendar patches by account, then by calendar id. */
export type CalendarPatches = Record<string, Record<string, Record<string, unknown>>>;

const seesBusy = (rights: CalendarRights | undefined): boolean =>
  Boolean(rights?.mayReadFreeBusy || rights?.mayReadItems);

/** Patches that let `people` see the calendar's busy times; who sees them already keeps their rights. */
const showTo = (calendar: CalendarShare, people: string[]): Record<string, unknown> =>
  Object.fromEntries(
    people
      .filter((id) => !seesBusy(calendar.shareWith?.[id]))
      .map((id) => [`shareWith/${id}`, FREE_BUSY]),
  );

const nonEmpty = (patches: Record<string, Record<string, unknown>>) =>
  Object.fromEntries(Object.entries(patches).filter(([, patch]) => Object.keys(patch).length));

/**
 * Someone new in the company: their calendars show everyone else when they are busy, and every
 * colleague whose calendars show all colleagues (they kept the default) shows the newcomer too.
 * Who took that back for a calendar is left alone.
 */
export const newcomerPatches = (
  newcomer: string,
  calendars: Record<string, CalendarShare[]>,
): CalendarPatches => {
  const people = Object.keys(calendars);
  const result: CalendarPatches = {};
  for (const [account, list] of Object.entries(calendars)) {
    const others = people.filter((id) => id !== account && id !== newcomer);
    const patches = Object.fromEntries(
      list.map((calendar) => {
        if (account === newcomer) {
          return [
            calendar.id,
            showTo(
              calendar,
              people.filter((id) => id !== newcomer),
            ),
          ];
        }
        const shownToAll = others.every((id) => seesBusy(calendar.shareWith?.[id]));
        return [calendar.id, shownToAll ? showTo(calendar, [newcomer]) : {}];
      }),
    );
    const kept = nonEmpty(patches);
    if (Object.keys(kept).length) result[account] = kept;
  }
  return result;
};

/** The Firmenverwaltung's "für alle einschalten": every calendar shows every colleague. */
export const everyonePatches = (calendars: Record<string, CalendarShare[]>): CalendarPatches => {
  const people = Object.keys(calendars);
  const result: CalendarPatches = {};
  for (const [account, list] of Object.entries(calendars)) {
    const others = people.filter((id) => id !== account);
    const kept = nonEmpty(
      Object.fromEntries(list.map((calendar) => [calendar.id, showTo(calendar, others)])),
    );
    if (Object.keys(kept).length) result[account] = kept;
  }
  return result;
};
