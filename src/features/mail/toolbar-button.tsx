/**
 * One button of the reading pane's toolbar. Every action there looks the same: an icon with its
 * name beside it where the pane is wide enough, the icon alone (named by its aria-label and
 * title) where it is narrow, a phone or a tablet's split view. Menus open from it too (Radix
 * passes its trigger props through).
 */
import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export const ToolbarButton = ({
  label,
  shortcut,
  icon,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children"> & {
  label: string;
  /** Named in the tooltip. */
  shortcut?: string;
  icon: ReactNode;
}) => (
  <Button
    variant="ghost"
    aria-label={label}
    title={shortcut ? `${label} (${shortcut})` : label}
    className={cn("size-9 px-0 @[66rem]:w-auto @[66rem]:gap-1.5 @[66rem]:px-2.5", className)}
    {...props}
  >
    {icon}
    <span className="hidden @[66rem]:inline">{label}</span>
  </Button>
);
