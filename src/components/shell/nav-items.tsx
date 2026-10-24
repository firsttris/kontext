import { CalendarDays, ListChecks, Mail, MessagesSquare, Users } from "lucide-react";
import { m } from "@/paraglide/messages";

/** The apps of the core suite, in the order of the rail (and of the shortcuts 1–5). */
export const NAV_ITEMS = [
  { to: "/mail", label: m.nav_mail, icon: Mail },
  { to: "/calendar", label: m.nav_calendar, icon: CalendarDays },
  { to: "/contacts", label: m.nav_contacts, icon: Users },
  { to: "/tasks", label: m.nav_tasks, icon: ListChecks },
  { to: "/chat", label: m.nav_chat, icon: MessagesSquare },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];
const item = (to: NavItem["to"]) => NAV_ITEMS.find((entry) => entry.to === to)!;

/** The phone's tab bar: the four used most; the rest is under "Mehr". */
export const TAB_ITEMS = [item("/mail"), item("/calendar"), item("/chat"), item("/tasks")];
export const MORE_ITEMS = [item("/contacts")];
