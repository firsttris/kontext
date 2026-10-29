/**
 * What shows under a line while it is swiped: the colour and sign of what letting go does, on the
 * side the line moves away from.
 */
import { Archive, Mail, MailOpen, Star, StarOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import type { SwipeAction, SwipeDirection } from "@/lib/swipe";
import { m } from "@/paraglide/messages";

const look = (action: SwipeAction, unread: boolean, flagged: boolean) => {
  switch (action) {
    case "archive":
      return { Icon: Archive, label: m.settings_swipe_archive(), color: "bg-ok" };
    case "delete":
      return { Icon: Trash2, label: m.settings_swipe_delete(), color: "bg-danger" };
    case "read":
      return unread
        ? { Icon: MailOpen, label: m.mail_mark_read(), color: "bg-accent" }
        : { Icon: Mail, label: m.mail_mark_unread(), color: "bg-accent" };
    case "flag":
      return flagged
        ? { Icon: StarOff, label: m.mail_unflag(), color: "bg-warn" }
        : { Icon: Star, label: m.mail_flag(), color: "bg-warn" };
    case "none":
      return null;
  }
};

export const SwipeBackdrop = ({
  action,
  side,
  unread,
  flagged,
}: {
  action: SwipeAction;
  /** Where the finger moves the line: the sign shows on the other side, where it uncovers. */
  side: SwipeDirection;
  unread: boolean;
  flagged: boolean;
}) => {
  const shown = look(action, unread, flagged);
  if (!shown) return null;
  const { Icon, label, color } = shown;
  return (
    <div
      aria-hidden="true"
      data-swipe={action}
      className={cn(
        "absolute inset-0 flex items-center gap-2 px-5 text-[13px] font-medium text-white",
        color,
        side === "left" ? "justify-end" : "justify-start",
      )}
    >
      <Icon size={18} />
      {label}
    </div>
  );
};
