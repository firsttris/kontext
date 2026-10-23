/** Events take the colour of their calendar (`--cal`, set per event). */
import type { CSSProperties } from "react";
import type { CalendarEvent } from "@/lib/jscalendar";

export const calendarColor = (event: CalendarEvent) =>
  ({ "--cal": event.color ?? "var(--accent)" }) as CSSProperties;

/** Events the user still has to answer are drawn dashed. */
export const eventClass = (invitation: boolean) =>
  invitation
    ? "border-[1.5px] border-dashed border-muted bg-bg"
    : "border border-[color-mix(in_srgb,var(--cal)_40%,transparent)] bg-[color-mix(in_srgb,var(--cal)_13%,var(--bg))]";
