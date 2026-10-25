import { CalendarDays, FileText, ListChecks, Mail, MessagesSquare, Users } from "lucide-react";
import { useDocumentsUrl } from "@/features/documents/queries";
import { m } from "@/paraglide/messages";

/** The apps of the core suite, in the order of the rail (and of the shortcuts 1–5). */
export const NAV_ITEMS = [
  { to: "/mail", label: m.nav_mail, icon: Mail },
  { to: "/calendar", label: m.nav_calendar, icon: CalendarDays },
  { to: "/contacts", label: m.nav_contacts, icon: Users },
  { to: "/tasks", label: m.nav_tasks, icon: ListChecks },
  { to: "/chat", label: m.nav_chat, icon: MessagesSquare },
] as const;

/** Documents (Schreibzeug), the sixth app, where the server has it (shortcut 6). */
const DOCUMENTS_ITEM = { to: "/documents", label: m.nav_documents, icon: FileText } as const;

type NavItem = (typeof NAV_ITEMS)[number] | typeof DOCUMENTS_ITEM;
const item = (to: NavItem["to"]) => NAV_ITEMS.find((entry) => entry.to === to)!;

/** The phone's tab bar: the four used most; the rest is under "Mehr". */
export const TAB_ITEMS = [item("/mail"), item("/calendar"), item("/chat"), item("/tasks")];

/** The apps of the rail and the shortcuts: the core suite, and documents when there are. */
export const useNavItems = (): readonly NavItem[] =>
  useDocumentsUrl() ? [...NAV_ITEMS, DOCUMENTS_ITEM] : NAV_ITEMS;

/** The apps under "Mehr" on the phone. */
export const useMoreItems = (): readonly NavItem[] =>
  useDocumentsUrl() ? [item("/contacts"), DOCUMENTS_ITEM] : [item("/contacts")];
