import {
  CalendarDays,
  FileText,
  ListChecks,
  Mail,
  MessagesSquare,
  Phone,
  Users,
} from "lucide-react";
import { useDocumentsUrl } from "@/features/documents/queries";
import { usePhone } from "@/features/phone/queries";
import { moreModules, tabBarModules } from "@/lib/tab-bar";
import { m } from "@/paraglide/messages";
import { useTabChoice } from "./tab-bar-settings";

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

/** Telephony, for whoever may telephone through the box (in the rail below the apps). */
const PHONE_ITEM = { to: "/phone", label: m.nav_phone, icon: Phone } as const;

export type NavItem = (typeof NAV_ITEMS)[number] | typeof DOCUMENTS_ITEM | typeof PHONE_ITEM;

/** "Telefon" in the rail and on the phone, for whoever may telephone through the box. */
export const usePhoneNav = (): boolean => {
  const { enabled, allowed } = usePhone();
  return enabled && allowed;
};

/** The apps of the rail and the shortcuts: the core suite, and documents when there are. */
export const useNavItems = (): readonly NavItem[] =>
  useDocumentsUrl() ? [...NAV_ITEMS, DOCUMENTS_ITEM] : NAV_ITEMS;

/** Every app this person has, for the phone: the rail's apps and the telephone. */
export const usePhoneApps = (): readonly NavItem[] => {
  const items = useNavItems();
  return usePhoneNav() ? [...items, PHONE_ITEM] : items;
};

const pick = (apps: readonly NavItem[], paths: readonly string[]) =>
  paths.map((to) => apps.find((app) => app.to === to)!);

/** The phone's tab bar: the apps chosen in the settings (by default the four used most). */
export const useTabItems = (): readonly NavItem[] => {
  const apps = usePhoneApps();
  return pick(
    apps,
    tabBarModules(
      useTabChoice(),
      apps.map((app) => app.to),
    ),
  );
};

/** The apps under "Mehr" on the phone: those not in the tab bar. */
export const useMoreItems = (): readonly NavItem[] => {
  const apps = usePhoneApps();
  const available = apps.map((app) => app.to);
  return pick(apps, moreModules(available, tabBarModules(useTabChoice(), available)));
};
