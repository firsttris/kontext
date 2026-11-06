/** An event's title in the views, with a small lock when it is private. */
import { Lock } from "lucide-react";
import { cn } from "@/lib/cn";
import { type CalendarEvent, eventTitle, isPrivate } from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";

export const EventTitle = ({ event, className }: { event: CalendarEvent; className?: string }) => (
  <span className={cn("flex min-w-0 items-center gap-1", className)}>
    {isPrivate(event) ? (
      <Lock
        size={12}
        className="shrink-0 text-muted"
        aria-label={event.title ? m.calendar_event_private() : undefined}
        aria-hidden={event.title ? undefined : true}
      />
    ) : null}
    <span className="truncate">{eventTitle(event, m.calendar_event_private())}</span>
  </span>
);
