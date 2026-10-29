/**
 * Settings of the own account: name, signatures, out-of-office reply, deputy, mail rules,
 * password and 2FA, AI agents, look.
 */
import { Link } from "@tanstack/react-router";
import {
  AtSign,
  BadgeCheck,
  Bot,
  ChevronLeft,
  ChevronRight,
  DatabaseBackup,
  Globe,
  Handshake,
  Inbox,
  KeyRound,
  ListFilter,
  LockKeyhole,
  type LucideIcon,
  MessagesSquare,
  Palette,
  Palmtree,
  PenLine,
  Phone,
  RefreshCw,
  Scale,
  ShieldCheck,
  Signature,
  TextQuote,
  Timer,
  Truck,
  User,
  Users,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useId } from "react";
import { TabBar } from "@/components/shell/app-shell";
import { AgentsSection } from "@/features/agents/agents-section";
import { BackupSection } from "@/features/company/backup-section";
import { ChatSection } from "@/features/company/chat-section";
import { EmployeesSection } from "@/features/company/employees-section";
import { ExternalHintSection } from "@/features/company/external-hint-section";
import { IdleLogoutSection } from "@/features/company/idle-logout-section";
import { LegalFooterSection } from "@/features/company/legal-footer-section";
import { MailboxesSection } from "@/features/company/mailboxes-section";
import { MigrationSection } from "@/features/company/migration-section";
import { useIsCompanyAdmin } from "@/features/company/queries";
import { SecuritySection as CompanySecuritySection } from "@/features/company/security-section";
import { SmimeAuthoritiesSection } from "@/features/company/smime-authorities-section";
import { ExternalSection } from "@/features/external/external-section";
import { useExternalAccounts } from "@/features/external/queries";
import { usePhone } from "@/features/phone/queries";
import { RulesSection } from "@/features/rules/rules-section";
import { SnippetsSection } from "@/features/snippets/snippets-section";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import type { settingsSections } from "@/routes/_app/settings";
import { AppPasswordsCard } from "./app-passwords-card";
import { AppearanceSection } from "./appearance-section";
import { DeputySection } from "./deputy-section";
import { ProfileSection } from "./profile-section";
import { SecuritySection } from "./security-section";
import { SignatureDetailsCard } from "./signature-details-card";
import { SyncSection } from "./sync-section";
import { VacationSection } from "./vacation-section";

// OpenPGP comes with its section only.
const EncryptionSection = lazy(() =>
  import("./encryption-section").then((module) => ({ default: module.EncryptionSection })),
);
// The signature editors bring the mail editor (Tiptap): loaded when their section opens.
const SignatureSection = lazy(() =>
  import("./signature-section").then((module) => ({ default: module.SignatureSection })),
);
const PhoneSettingsSection = lazy(() =>
  import("@/features/phone/phone-settings").then((module) => ({
    default: module.PhoneSettingsSection,
  })),
);
const CompanySignatureSection = lazy(() =>
  import("@/features/company/signature-section").then((module) => ({
    default: module.CompanySignatureSection,
  })),
);

type Section = (typeof settingsSections)[number];

type Entry = { id: Section; label: () => string; icon: LucideIcon };

const OWN: Entry[] = [
  { id: "profile", label: m.settings_profile, icon: User },
  { id: "signature", label: m.settings_signature, icon: PenLine },
  { id: "accounts", label: m.settings_external, icon: AtSign },
  { id: "vacation", label: m.settings_vacation, icon: Palmtree },
  { id: "deputy", label: m.settings_deputy, icon: Handshake },
  { id: "rules", label: m.settings_rules, icon: ListFilter },
  { id: "snippets", label: m.settings_snippets, icon: TextQuote },
  { id: "sync", label: m.settings_sync, icon: RefreshCw },
  { id: "security", label: m.settings_security, icon: KeyRound },
  { id: "encryption", label: m.settings_encryption, icon: LockKeyhole },
  { id: "agents", label: m.settings_agents, icon: Bot },
  { id: "appearance", label: m.settings_appearance, icon: Palette },
];

/** The Firmenverwaltung, only for accounts with that right. */
const COMPANY: Entry[] = [
  { id: "employees", label: m.company_employees, icon: Users },
  { id: "mailboxes", label: m.company_mailboxes, icon: Inbox },
  { id: "company-signature", label: m.company_signature, icon: Signature },
  { id: "company-legal", label: m.company_legal, icon: Scale },
  { id: "company-chat", label: m.company_chat, icon: MessagesSquare },
  { id: "company-security", label: m.company_security, icon: ShieldCheck },
  { id: "company-idle", label: m.company_idle, icon: Timer },
  { id: "company-external", label: m.company_external, icon: Globe },
  { id: "company-smime", label: m.company_smime, icon: BadgeCheck },
  { id: "company-backup", label: m.company_backup, icon: DatabaseBackup },
  { id: "phone", label: m.phone_settings, icon: Phone },
  { id: "migration", label: m.company_migration, icon: Truck },
];

const CONTENT: Record<Section, () => ReactNode> = {
  profile: () => (
    <>
      <ProfileSection />
      <SignatureDetailsCard />
    </>
  ),
  signature: () => <SignatureSection />,
  accounts: () => <ExternalSection />,
  vacation: () => <VacationSection />,
  deputy: () => <DeputySection />,
  rules: () => <RulesSection />,
  snippets: () => <SnippetsSection />,
  sync: () => (
    <>
      <SyncSection />
      <AppPasswordsCard />
    </>
  ),
  security: () => <SecuritySection />,
  encryption: () => <EncryptionSection />,
  agents: () => <AgentsSection />,
  appearance: () => <AppearanceSection />,
  employees: () => <EmployeesSection />,
  mailboxes: () => <MailboxesSection />,
  "company-signature": () => <CompanySignatureSection />,
  "company-legal": () => <LegalFooterSection />,
  "company-chat": () => <ChatSection />,
  "company-security": () => <CompanySecuritySection />,
  "company-idle": () => <IdleLogoutSection />,
  "company-external": () => <ExternalHintSection />,
  "company-smime": () => <SmimeAuthoritiesSection />,
  "company-backup": () => <BackupSection />,
  phone: () => <PhoneSettingsSection />,
  migration: () => <MigrationSection />,
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
  // Other mailboxes need the server's Stalwart key; without it the entry is left out.
  const { data: external } = useExternalAccounts();
  const own = external === null ? OWN.filter((entry) => entry.id !== "accounts") : OWN;
  // Telephony needs LiveKit on the server; without it the section has nothing to set.
  const phone = usePhone().enabled;
  const company = COMPANY.filter((entry) => entry.id !== "phone" || phone);
  const title = [...OWN, ...COMPANY].find((s) => s.id === current)!.label();
  return (
    <>
      <nav
        aria-label={m.nav_settings()}
        className={cn(
          "h-full w-full shrink-0 flex-col gap-4 border-border bg-bg px-3 py-4 md:w-sidebar md:border-r md:bg-side",
          section ? "hidden md:flex" : "flex",
        )}
      >
        <h1 className="m-0 px-2.5 text-[30px] leading-tight font-semibold tracking-tight md:text-[17px]">
          {m.nav_settings()}
        </h1>
        {/* Own sections and the Firmenverwaltung are taller than a phone: they scroll, the tab bar stays. */}
        <div className="-mx-3 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3">
          <div className="px-2.5 text-[12px] font-medium text-muted">{m.settings_my_account()}</div>
          <SectionLinks entries={own} current={current} />
          {admin ? (
            <div className="flex flex-col gap-1">
              <div className="px-2.5 text-[12px] font-medium text-muted">{m.company_heading()}</div>
              <SectionLinks entries={company} current={current} />
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
          <Suspense fallback={<p className="m-0 text-[14px] text-muted">{m.common_loading()}</p>}>
            {CONTENT[current]()}
          </Suspense>
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
}) => {
  // Named by its heading, so it is a region one can find (and jump to).
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-xl border border-border p-4 md:p-5"
    >
      <div className="flex flex-col gap-1">
        <h3 id={id} className="m-0 text-[15px] font-semibold">
          {title}
        </h3>
        {description ? <p className="m-0 text-[13px] text-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
};
