/**
 * An appointment's "Ort": free text, with places to pick while typing (like the attendees' field:
 * arrows, Enter, Escape closes the list and not the dialog, see keepOpenForList in dialog.tsx).
 * Picking one writes its one-line address into the field.
 */
import { MapPin } from "lucide-react";
import { type KeyboardEvent, useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { type Place, usePlaceSuggestions } from "./place-queries";

type Props = {
  value: string;
  onChange: (value: string) => void;
};

export const PlaceField = ({ value, onChange }: Props) => {
  const [focused, setFocused] = useState(false);
  // Closed by Escape or a pick until the text changes again; a place already there asks nothing.
  const [dismissed, setDismissed] = useState(true);
  const [highlight, setHighlight] = useState(0);
  const listId = useId();
  const labelId = useId();
  const places = usePlaceSuggestions(value, dismissed);
  const shown =
    focused && !dismissed && !(places.length === 1 && places[0]?.label === value.trim())
      ? places
      : [];

  const pick = (place: Place) => {
    onChange(place.label);
    setDismissed(true);
    setHighlight(0);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (shown.length === 0) return;
    if (event.key === "Escape") {
      setDismissed(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setHighlight((h) => (h + (event.key === "ArrowDown" ? 1 : shown.length - 1)) % shown.length);
    } else if (event.key === "Enter") {
      // Choosing a place never submits the appointment.
      event.preventDefault();
      pick(shown[highlight] ?? shown[0]!);
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span id={labelId} className="text-[13px] text-muted">
        {m.calendar_event_location()}
      </span>
      <div className="relative">
        <Input
          aria-labelledby={labelId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={shown.length > 0}
          aria-controls={listId}
          autoComplete="off"
          placeholder={m.calendar_event_location_hint()}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setDismissed(false);
            setHighlight(0);
          }}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {shown.length > 0 ? (
          <div
            id={listId}
            role="listbox"
            aria-label={m.calendar_place_suggestions()}
            className="absolute top-full left-0 z-20 mt-1 w-full rounded-xl border border-border bg-bg p-1 shadow-lg"
          >
            {shown.map((place, index) => (
              <div
                key={place.label}
                role="option"
                tabIndex={-1}
                aria-selected={index === highlight}
                onMouseDown={(event) => {
                  // Keeps the focus in the field, so the list does not close before the pick.
                  event.preventDefault();
                  pick(place);
                }}
                className={cn(
                  "flex cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-[14px]",
                  index === highlight && "bg-hover",
                )}
              >
                <MapPin size={14} className="mt-[3px] shrink-0 text-muted" />
                <span>{place.label}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
