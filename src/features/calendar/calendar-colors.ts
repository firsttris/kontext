/**
 * The colours a calendar can have: the same ones the app gives a calendar whose owner picked none,
 * so the colour it is shown in is always one of the choices. Pure.
 */
import type { ColorChoice } from "@/components/name-dialog";
import { m } from "@/paraglide/messages";

export const CALENDAR_COLORS: ColorChoice[] = [
  { color: "#2563eb", name: m.category_color_blue },
  { color: "#16a34a", name: m.category_color_green },
  { color: "#d97706", name: m.category_color_orange },
  { color: "#9333ea", name: m.category_color_violet },
  { color: "#dc2626", name: m.category_color_red },
  { color: "#0891b2", name: m.category_color_teal },
  { color: "#db2777", name: m.calendar_color_pink },
];

/**
 * The Calendar/set patch for a new name and colour: only what changed, so a calendar shown in a
 * colour the app chose keeps having none stored until the user picks one. Name and colour are the
 * user's own (draft-ietf-jmap-calendars, "per-user properties"; Stalwart keeps them in the user's
 * preferences, crates/jmap/src/calendar/set.rs `update_calendar`).
 */
export const calendarChanges = (
  shown: { name: string; color: string },
  name: string,
  color: string | undefined,
): { name?: string; color?: string } => ({
  ...(name !== shown.name ? { name } : {}),
  ...(color && color !== shown.color ? { color } : {}),
});
