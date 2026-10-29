/** The link behind an event in the views: it opens the event, a birthday opens the contact. */
import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { isBirthday } from "@/lib/birthdays";
import type { CalendarEvent } from "@/lib/jscalendar";
import { eventSearch } from "./queries";

type Props = {
  event: CalendarEvent;
  className?: string;
  style?: CSSProperties;
  draggable?: boolean;
  children: ReactNode;
};

export const EventLink = ({ event, ...props }: Props) =>
  isBirthday(event) ? (
    <Link
      to="/contacts"
      search={{ id: event.contact.id, account: event.contact.accountId }}
      {...props}
    />
  ) : (
    <Link to="/calendar" search={(prev) => ({ ...prev, ...eventSearch(event) })} {...props} />
  );
