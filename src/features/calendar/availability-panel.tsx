/**
 * Planning a meeting in the editor: as soon as it has attendees and a time, who is free then and
 * when everyone is. A timeline on desktop, a status list with a schedule sheet on phones.
 */
import { useMediaQuery } from "@/components/use-media-query";
import type { Slot } from "@/lib/availability";
import type { EventForm } from "@/lib/event-form";
import { AvailabilityPhone } from "./availability-phone";
import { AvailabilityTimeline } from "./availability-timeline";
import { type Editing, usePlanning } from "./use-planning";

type Props = {
  form: EventForm;
  /** The appointment before this change, when editing one. */
  editing: Editing | null;
  onPick: (slot: Slot) => void;
};

export const AvailabilityPanel = ({ form, editing, onPick }: Props) => {
  const planning = usePlanning(form, editing);
  const wide = useMediaQuery("(min-width: 768px)");
  if (!planning.hasAttendees || !planning.slot) return null;
  return wide ? (
    <AvailabilityTimeline planning={planning} onPick={onPick} />
  ) : (
    <AvailabilityPhone planning={planning} onPick={onPick} />
  );
};
