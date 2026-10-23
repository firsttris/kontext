import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export const Input = ({ className, ...props }: ComponentProps<"input">) => (
  <input
    className={cn(
      "h-10 w-full rounded-lg border border-border bg-bg px-3 text-[14px] text-fg outline-none transition-colors focus:border-muted",
      className,
    )}
    {...props}
  />
);

export const Textarea = ({ className, ...props }: ComponentProps<"textarea">) => (
  <textarea
    className={cn(
      "min-h-24 w-full rounded-lg border border-border bg-bg px-3 py-2 text-[14px] text-fg outline-none transition-colors focus:border-muted",
      className,
    )}
    {...props}
  />
);

export const Label = ({ className, ...props }: ComponentProps<"label">) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as a child or via htmlFor
  <label className={cn("flex flex-col gap-1.5 text-[13px] text-muted", className)} {...props} />
);
