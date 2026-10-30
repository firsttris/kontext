/**
 * Hidden calendars move from the browser to the server: Stalwart 1.0 keeps `isVisible` per person,
 * also for a colleague's calendar that is only shared to read (0.16 refused that, so the app kept
 * the choice per device). What a device hid before is set on the server once and then forgotten
 * there. The app's own rows (birthdays, tasks) are no calendars and stay per device. Pure.
 */
type Shown = { key: string; visible: boolean };

/** `local`: the keys this device hid; `hide`: set on the server; `forget`: drop from the device. */
export const hiddenToMove = (
  local: ReadonlySet<string>,
  calendars: Shown[],
): { hide: string[]; forget: string[] } => {
  const known = calendars.filter((calendar) => local.has(calendar.key));
  return {
    hide: known.filter((calendar) => calendar.visible).map((calendar) => calendar.key),
    forget: known.map((calendar) => calendar.key),
  };
};

/**
 * A calendar change with the person's own `isVisible` in it. Stalwart 1.0.1 copies one member's
 * settings of a shared mailbox's calendar to another on that member's next Calendar/set
 * (`inherit_owner_preferences`, crates/jmap/src/calendar/set.rs): without it, a colleague's hidden
 * calendar would turn hidden for whoever changes its colour or sharing next.
 */
export const withOwnVisibility = <T extends object>(
  patch: T,
  visible: boolean,
): T & { isVisible: boolean } =>
  ((patch as { isVisible?: boolean }).isVisible === undefined
    ? { ...patch, isVisible: visible }
    : patch) as T & { isVisible: boolean };
