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
