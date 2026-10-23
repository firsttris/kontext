/** Show, answer, create and edit an appointment, in a dialog (a sheet on phones). */
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { type CalendarEvent, isInstance } from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { EventDetails } from "./event-details";
import { EventEditor } from "./event-editor";
import { useSeries } from "./queries";

type Props = { eventId: string; event: CalendarEvent | undefined; start?: string };

export const EventDialog = ({ eventId, event, start }: Props) => {
  const navigate = useNavigate();
  const isNew = eventId === "new";
  const [editing, setEditing] = useState(isNew);
  // An instance shows and edits the rule of its series.
  const { data: found, isPending: seriesPending } = useSeries(
    event && isInstance(event) ? event.baseEventId : undefined,
  );
  const series = found ?? undefined;
  const close = () =>
    navigate({
      to: "/calendar",
      search: (prev) => ({ ...prev, event: undefined, start: undefined }),
    });
  if (!isNew && !event) return null;
  const waiting = event && isInstance(event) && seriesPending;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) void close();
      }}
      title={isNew ? m.calendar_new() : editing ? (event?.title ?? "") : event?.title || "—"}
    >
      {waiting ? (
        <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>
      ) : editing ? (
        <EventEditor
          event={isNew ? undefined : event}
          series={series}
          start={start}
          onDone={close}
          onCancel={() => (isNew ? close() : setEditing(false))}
        />
      ) : (
        <EventDetails
          event={event!}
          series={series}
          onEdit={() => setEditing(true)}
          onDone={close}
        />
      )}
    </Dialog>
  );
};
