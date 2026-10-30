import { createFileRoute } from "@tanstack/react-router";
import { RsvpPage } from "@/features/calendar/rsvp-page";
import { z } from "@/lib/zod";

/** Answering an invitation from Kontext: for attendees outside, without signing in, by token. */
export const Route = createFileRoute("/rsvp")({
  validateSearch: z.object({
    t: z.string().catch(""),
    r: z.enum(["accepted", "declined", "tentative"]).optional().catch(undefined),
  }),
  component: RsvpRoute,
});

function RsvpRoute() {
  const { t, r } = Route.useSearch();
  return <RsvpPage token={t} answer={r} />;
}
