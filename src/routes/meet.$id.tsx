import { createFileRoute } from "@tanstack/react-router";
import { MeetingPage } from "@/features/calls/meeting-page";

/** A video meeting by link: open without signing in, for guests too. */
export const Route = createFileRoute("/meet/$id")({
  component: MeetingRoute,
});

function MeetingRoute() {
  const { id } = Route.useParams();
  return <MeetingPage id={id} />;
}
