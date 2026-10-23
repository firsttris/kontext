/** Settings of the own account: name, signatures, out-of-office reply, password and 2FA, look. */
import { Link } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Inbox,
  KeyRound,
  type LucideIcon,
  Palette,
  Palmtree,
  PenLine,
  User,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { TabBar } from "@/components/shell/app-shell";
import { EmployeesSection } from "@/features/company/employees-section";
import { MailboxesSection } from "@/features/company/mailboxes-section";
import { useIsCompanyAdmin } from "@/features/company/queries";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import type { settingsSections } from "@/routes/_app/settings";
import { AppearanceSection } from "./appearance-section";
import { ProfileSection } from "./profile-section";
import { SecuritySection } from "./security-section";
import { SignatureSection } from "./signature-section";
import { VacationSection } from "./vacation-section";

type Section = (typeof settingsSections)[number];

type Entry = { id: Section; label: () => string; icon: LucideIcon };

const OWN: Entry[] = [
  { id: "profile", label: m.settings_profile, icon: User },
  { id: "signature", label: m.settings_signature, icon: PenLine },
  { id: "vacation", label: m.settings_vacation, icon: Palmtree },
  { id: "security", label: m.settings_security, icon: KeyRound },
  { id: "appearance", label: m.settings_appearance, icon: Palette },
];

/** The Firmenverwaltung, only for accounts with that right. */
const COMPANY: Entry[] = [
  { id: "employees", label: m.company_employees, icon: Users },
  { id: "mailboxes", label: m.company_mailboxes, icon: Inbox },
];

const CONTENT: Record<Section, () => ReactNode> = {
  profile: () => <ProfileSection />,
  signature: () => <SignatureSection />,
  vacation: () => <VacationSection />,
  security: () => <SecuritySection />,
  appearance: () => <AppearanceSection />,
  employees: () => <EmployeesSection />,
  mailboxes: () => <MailboxesSection />,
};

const SectionLinks = ({ entries, current }: { entries: Entry[]; current: Section }) => (
  <ul className="m-0 flex list-none flex-col gap-px p-0">
    {entries.map(({ id, label, icon: Icon }) => (
      <li key={id}>
        <Link
          to="/settings"
          search={{ section: id }}
          aria-current={id === current ? "page" : undefined}
          className={cn(
            "flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-[15px] no-underline hover:bg-hover md:h-[34px] md:text-[14px]",
            id === current ? "md:bg-subtle md:font-medium md:text-fg" : "md:text-muted",
            "text-fg",
          )}
        >
          <Icon size={16} strokeWidth={1.75} />
          <span className="flex-1">{label()}</span>
          <ChevronRight size={16} className="text-muted md:hidden" />
        </Link>
      </li>
    ))}
  </ul>
);

export const SettingsPage = ({ section }: { section: Section | undefined }) => {
  const current = section ?? "profile";
  const admin = useIsCompanyAdmin();
  const title = [...OWN, ...COMPANY].find((s) => s.id === current)!.label();
  return (
    <>
      <nav
        aria-label={m.nav_settings()}
        className={cn(
          "h-full w-full shrink-0 flex-col gap-4 border-border bg-bg px-3 py-4 md:w-[236px] md:border-r md:bg-side",
          section ? "hidden md:flex" : "flex",
        )}
      >
        <h1 className="m-0 px-2.5 text-[30px] leading-tight font-semibold tracking-tight md:text-[17px]">
          {m.nav_settings()}
        </h1>
        <div className="px-2.5 text-[12px] font-medium text-muted">{m.settings_my_account()}</div>
        <div className="flex flex-1 flex-col gap-4">
          <SectionLinks entries={OWN} current={current} />
          {admin ? (
            <div className="flex flex-col gap-1">
              <div className="px-2.5 text-[12px] font-medium text-muted">{m.company_heading()}</div>
              <SectionLinks entries={COMPANY} current={current} />
            </div>
          ) : null}
        </div>
        <div className="-mx-3 -mb-4">
          <TabBar />
        </div>
      </nav>
      <main
        className={cn(
          "h-full min-w-0 flex-1 overflow-y-auto",
          section ? "block" : "hidden md:block",
        )}
      >
        <div className="mx-auto flex max-w-[640px] flex-col gap-6 px-4 pt-3 pb-12 md:px-8 md:pt-9">
          <Link
            to="/settings"
            search={{}}
            className="flex items-center gap-1 text-[14px] text-muted no-underline md:hidden"
          >
            <ChevronLeft size={18} /> {m.nav_settings()}
          </Link>
          <h2 className="m-0 text-[24px] font-semibold tracking-tight">{title}</h2>
          {CONTENT[current]()}
        </div>
      </main>
    </>
  );
};

/** A titled block of settings with its own save button. */
export const SettingsCard = ({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) => (
  <section className="flex flex-col gap-4 rounded-xl border border-border p-4 md:p-5">
    <div className="flex flex-col gap-1">
      <h3 className="m-0 text-[15px] font-semibold">{title}</h3>
      {description ? <p className="m-0 text-[13px] text-muted">{description}</p> : null}
    </div>
    {children}
  </section>
);
