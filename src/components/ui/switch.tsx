/** An on/off switch: a button with role "switch", labelled by its text. */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export const Switch = ({
  checked,
  onChange,
  children,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className="flex w-full items-center justify-between gap-3 text-left text-[13px] disabled:opacity-50"
  >
    <span className="min-w-0">{children}</span>
    <span
      aria-hidden="true"
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-border",
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 size-4 rounded-full bg-bg shadow-sm transition-transform",
          checked ? "translate-x-[18px]" : "translate-x-0.5",
        )}
      />
    </span>
  </button>
);
