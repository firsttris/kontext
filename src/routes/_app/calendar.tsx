import { createFileRoute } from "@tanstack/react-router";
import { CalendarPage } from "@/features/calendar/calendar-page";
import { z } from "@/lib/zod";

export const Route = createFileRoute("/_app/calendar")({
  validateSearch: z.object({
    /** The shown day (YYYY-MM-DD); the week around it on desktop. */
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    view: z.enum(["day", "week", "month", "agenda"]).optional(),
    /** The open event, or "new". */
    event: z.string().optional(),
    /** The account of the open event when it is not the user's own (a shared calendar). */
    account: z.string().optional(),
    /** Start of a new event (YYYY-MM-DDTHH:MM). */
    start: z.string().optional(),
  }),
  component: CalendarRoute,
});

function CalendarRoute() {
  return <CalendarPage search={Route.useSearch()} />;
}
