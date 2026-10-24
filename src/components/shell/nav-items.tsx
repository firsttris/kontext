import { CalendarDays, ListChecks, Mail, Users } from "lucide-react";
import { m } from "@/paraglide/messages";

/** The apps of the core suite, in the order of the rail and the tab bar. */
export const NAV_ITEMS = [
  { to: "/mail", label: m.nav_mail, icon: Mail },
  { to: "/calendar", label: m.nav_calendar, icon: CalendarDays },
  { to: "/contacts", label: m.nav_contacts, icon: Users },
  { to: "/tasks", label: m.nav_tasks, icon: ListChecks },
] as const;
