/**
 * Addresses as chips, with suggestions while typing: To/Cc/Bcc in the composer (label in the
 * line) and the attendees of an appointment (a boxed field under its label, like the others).
 */
import { X } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useState } from "react";
import type { EmailAddress } from "@/jmap/types";
import { parseAddresses } from "@/lib/addresses";
import { cn } from "@/lib/cn";
import { displayName } from "@/lib/format";
import type { Suggestion } from "@/lib/groups";
import { m } from "@/paraglide/messages";

type Props = {
  label: string;
  value: EmailAddress[];
  onChange: (value: EmailAddress[]) => void;
  /** Colleagues, contacts, and groups that add all their members. */
  suggestions: Suggestion[];
  autoFocus?: boolean;
  boxed?: boolean;
  /** Shown while there are no chips. */
  placeholder?: string;
};

export const RecipientField = ({
  label,
  value,
  onChange,
  suggestions,
  autoFocus,
  boxed,
  placeholder,
}: Props) => {
  const [text, setText] = useState("");
  const [highlight, setHighlight] = useState(0);
  // Escape closes the list until the text changes.
  const [dismissed, setDismissed] = useState(false);
  const listId = useId();

  const matches = useMemo(() => {
    const needle = text.trim().toLowerCase();
    if (needle.length < 1 || dismissed) return [];
    const taken = new Set(value.map((a) => a.email.toLowerCase()));
    return suggestions
      .filter((a) => !taken.has(a.email.toLowerCase()))
      .filter(
        (a) =>
          a.email.toLowerCase().includes(needle) || (a.name ?? "").toLowerCase().includes(needle),
      )
      .slice(0, 6);
  }, [text, suggestions, value, dismissed]);

  /** A group stands for its members. */
  const pick = (suggestion: Suggestion) => add(suggestion.members ?? [suggestion]);

  const add = (addresses: EmailAddress[]) => {
    const known = new Set(value.map((a) => a.email.toLowerCase()));
    onChange([...value, ...addresses.filter((a) => !known.has(a.email.toLowerCase()))]);
    setText("");
    setHighlight(0);
  };

  /** Turns what was typed into chips; keeps text that is not an address yet. */
  const commit = (): boolean => {
    const { addresses, invalid } = parseAddresses(text);
    if (addresses.length === 0) return false;
    add(addresses);
    setText(invalid.join(", "));
    return true;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (matches.length > 0 && event.key === "Escape") {
      setDismissed(true);
    } else if (matches.length > 0 && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setHighlight(
        (h) => (h + (event.key === "ArrowDown" ? 1 : matches.length - 1)) % matches.length,
      );
    } else if (
      event.key === "Enter" ||
      event.key === "," ||
      event.key === ";" ||
      event.key === "Tab"
    ) {
      if (matches.length > 0 && event.key !== ",") {
        event.preventDefault();
        pick(matches[highlight] ?? matches[0]!);
      } else if (text.trim()) {
        // Half-typed text never submits the form around the field.
        if (commit() || event.key === "Enter") event.preventDefault();
      }
    } else if (event.key === "Backspace" && !text && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  };

  const field = (
    <div
      className={cn(
        "relative flex flex-1 flex-wrap items-center gap-1.5",
        boxed
          ? "min-h-10 rounded-lg border border-border bg-bg px-2 py-1 focus-within:border-muted"
          : "min-h-9 py-1",
      )}
    >
      {boxed ? null : <span className="w-9 shrink-0 text-[13px] text-muted">{label}</span>}
      {value.map((address) => (
        <span
          key={address.email}
          title={address.email}
          className="inline-flex h-6 items-center gap-1 rounded-full border border-border pr-1 pl-2.5 text-[13px]"
        >
          {displayName(address)}
          <button
            type="button"
            aria-label={`${address.email} entfernen`}
            onClick={() => onChange(value.filter((a) => a !== address))}
            className="flex size-4 items-center justify-center rounded-full text-muted hover:bg-hover hover:text-fg"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        aria-label={label}
        role="combobox"
        aria-expanded={matches.length > 0}
        aria-controls={listId}
        autoFocus={autoFocus}
        placeholder={value.length ? undefined : placeholder}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setHighlight(0);
          setDismissed(false);
        }}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (text.trim()) commit();
        }}
        className={cn(
          "h-7 min-w-[120px] flex-1 border-0 bg-transparent text-[14px] text-fg outline-none placeholder:text-muted",
          boxed && "px-1",
        )}
      />
      {matches.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          className={cn(
            "absolute top-full z-20 m-0 mt-1 list-none rounded-xl border border-border bg-bg p-1 shadow-lg",
            boxed ? "left-0 w-[min(360px,100%)]" : "left-9 w-[min(360px,calc(100%-36px))]",
          )}
        >
          {matches.map((address, index) => (
            <div
              key={address.email}
              role="option"
              tabIndex={-1}
              aria-selected={index === highlight}
              onMouseDown={(event) => {
                event.preventDefault();
                pick(address);
              }}
              className={cn(
                "flex cursor-pointer flex-col rounded-lg px-2.5 py-1.5",
                index === highlight && "bg-hover",
              )}
            >
              <span className="text-[14px]">{address.name ?? address.email}</span>
              {address.members ? (
                <span className="text-[12px] text-muted">
                  {m.contacts_group_count({ count: address.members.length })}
                </span>
              ) : address.name ? (
                <span className="text-[12px] text-muted">{address.email}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
  return boxed ? (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      {field}
    </div>
  ) : (
    field
  );
};
