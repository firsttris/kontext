/** A search field as in the chat, the calendar and the tasks: icon, words, Escape empties it. */
import { Search } from "lucide-react";
import { cn } from "@/lib/cn";

export const SearchField = ({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) => (
  <label
    className={cn(
      "flex items-center gap-2 rounded-[10px] bg-subtle px-3 text-muted focus-within:ring-1 focus-within:ring-border",
      className,
    )}
  >
    <Search size={15} aria-hidden="true" />
    <span className="sr-only">{label}</span>
    <input
      type="search"
      value={value}
      placeholder={label}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => event.key === "Escape" && onChange("")}
      className="min-w-0 flex-1 bg-transparent text-[14px] text-fg outline-none"
    />
  </label>
);
