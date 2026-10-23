import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { CalendarPage } from "@/features/calendar/calendar-page";

export const Route = createFileRoute("/_app/calendar")({
  validateSearch: z.object({
    /** The shown day (YYYY-MM-DD); the week around it on desktop. */
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    view: z.enum(["week", "day"]).optional(),
    /** The open event, or "new". */
    event: z.string().optional(),
    /** Start of a new event (YYYY-MM-DDTHH:MM). */
    start: z.string().optional(),
  }),
  component: CalendarRoute,
});

function CalendarRoute() {
  return <CalendarPage search={Route.useSearch()} />;
}
