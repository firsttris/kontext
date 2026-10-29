/** Show, answer, create, edit and duplicate an appointment, in a dialog (a sheet on phones). */
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
  const [mode, setMode] = useState<"show" | "edit" | "copy">(isNew ? "edit" : "show");
  const editing = mode !== "show";
  const copying = mode === "copy";
  // An instance shows and edits the rule of its series.
  const { data: found, isPending: seriesPending } = useSeries(
    event && isInstance(event) ? event : undefined,
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
      title={
        isNew
          ? m.calendar_new()
          : copying
            ? m.calendar_duplicate_title()
            : editing
              ? (event?.title ?? "")
              : event?.title || "—"
      }
      // Editing gets room for the attendees' schedules.
      className={editing ? "md:w-[min(760px,calc(100vw-32px))]" : undefined}
    >
      {waiting ? (
        <p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>
      ) : editing ? (
        <EventEditor
          // A copy is a new appointment, so the editor gets no event and no series.
          event={isNew || copying ? undefined : event}
          series={copying ? undefined : series}
          copyOf={copying ? event : undefined}
          start={start}
          onDone={close}
          onCancel={() => (isNew ? close() : setMode("show"))}
        />
      ) : (
        <EventDetails
          event={event!}
          series={series}
          onEdit={() => setMode("edit")}
          onDuplicate={() => setMode("copy")}
          onDone={close}
        />
      )}
    </Dialog>
  );
};
