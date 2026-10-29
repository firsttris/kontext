/**
 * The Firmenverwaltung's calls to the Kontext server (/api/company, server/company/routes.ts).
 * Unlike mail, contacts and calendar this is not JMAP: the server works with its own Stalwart key.
 */

import type { Category } from "../../../server/categories/categories";
import type {
  Company as CompanyData,
  Employee,
  SharedMailbox,
} from "../../../server/company/accounts";
import type { BackupSettings, BackupView } from "../../../server/company/backup-schema";
import type { FolderName } from "../../../server/company/mailstore";
import type { Check } from "../../../server/company/security";
import type { Job } from "../../../server/migration/jobs";
import type { ProviderId } from "../../../server/migration/providers";
import type { Sync } from "../../../server/migration/syncs";
import type { Vacation } from "../../../server/rules/filters";
import type { Rule } from "../../../server/rules/script";

export type { Employee, SharedMailbox };
/** A move as the server sends it (dates as text). */
export type Migration = Omit<Job, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};
export type Company = CompanyData & { selfId: string };
/** A move over IMAP as the server sends it (no password, dates as text). */
export type MailSync = Omit<Sync, "secret" | "createdAt" | "updatedAt" | "lastRunAt"> & {
  lastRunAt: string | null;
};

export type NewEmployee = {
  email: string;
  fullName: string;
  admin: boolean;
  mailboxIds: string[];
};
export type EmployeeChange = Partial<{
  fullName: string;
  aliases: string[];
  mailboxIds: string[];
  admin: boolean;
  active: boolean;
}>;
export type NewMailbox = {
  email: string;
  description: string;
  memberIds: string[];
  readerIds: string[];
};
export type MailboxChange = Partial<{
  description: string;
  aliases: string[];
  memberIds: string[];
  readerIds: string[];
}>;

const send = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(`/api/company${path}`, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? String(response.status));
  return result;
};

/** Whether the signed-in user may use the Firmenverwaltung (off on servers without the key). */
export const isCompanyAdmin = async (): Promise<boolean> => {
  const response = await fetch("/api/company/me", { credentials: "same-origin" });
  if (!response.ok) return false;
  return Boolean(((await response.json()) as { admin?: boolean }).admin);
};

export const getCompany = () => send<Company>("GET", "");

export const createEmployee = (employee: NewEmployee) =>
  send<{ id: string; password: string }>("POST", "/employees", employee);

export const updateEmployee = (id: string, change: EmployeeChange) =>
  send<{ ok: true }>("PATCH", `/employees/${encodeURIComponent(id)}`, change);

export const resetPassword = (id: string) =>
  send<{ password: string }>("POST", `/employees/${encodeURIComponent(id)}/password`);

export const resetTwoFactor = (id: string) =>
  send<{ ok: true }>("DELETE", `/employees/${encodeURIComponent(id)}/two-factor`);

/** Every colleague sees when everyone is busy; the number of calendars changed. */
export const showAvailabilityToAll = () =>
  send<{ calendars: number }>("POST", "/employees/availability");

export const getEmployeeVacation = (id: string) =>
  send<Vacation & { departed: boolean }>("GET", `/employees/${encodeURIComponent(id)}/vacation`);

export const setEmployeeVacation = (id: string, vacation: Vacation) =>
  send<{ ok: true }>("PUT", `/employees/${encodeURIComponent(id)}/vacation`, vacation);

export type Offboarding = {
  handoverTo: string | null;
  forwardTo: string | null;
  reply: { subject: string; text: string } | null;
};

export const offboard = (id: string, offboarding: Offboarding) =>
  send<{ ok: true }>("POST", `/employees/${encodeURIComponent(id)}/offboarding`, offboarding);

export type SignatureTemplate = { html: string; text: string };

export const getSignature = () => send<SignatureTemplate>("GET", "/signature");

export type SecurityReport = {
  https: Check | null;
  domains: { domain: string; checks: Check[] }[];
};

/** How safe the company's mail travels (server/company/security.ts). */
export const getSecurity = () => send<SecurityReport>("GET", "/security");

export type { BackupSettings, BackupView };

/** The Datensicherung as the host reports it (server/company/backup.ts). */
export const getBackup = () => send<BackupView>("GET", "/backup");

export const saveBackupSettings = (settings: BackupSettings) =>
  send<BackupSettings>("PUT", "/backup/settings", settings);

/** "Jetzt sichern": the host starts it within moments; 409 while one runs. */
export const runBackup = () => send<{ ok: true }>("POST", "/backup/run");

/** How long the team chat keeps messages, in days; 0: for ever. */
export const getChatRetention = () => send<{ days: number }>("GET", "/chat-retention");

export const saveChatRetention = (days: number) =>
  send<{ days: number; removed: number }>("PUT", "/chat-retention", { days });

export const saveSignature = (template: SignatureTemplate & { apply: boolean }) =>
  send<{ updated: number }>("PUT", "/signature", template);

export const createMailbox = (mailbox: NewMailbox) =>
  send<{ id: string }>("POST", "/mailboxes", mailbox);

export const updateMailbox = (id: string, change: MailboxChange) =>
  send<{ ok: true }>("PATCH", `/mailboxes/${encodeURIComponent(id)}`, change);

/** Whose rules the admin keeps: a shared mailbox or an employee's own mailbox. */
export type RulesOwner = { kind: "mailboxes" | "employees"; id: string };

const rulesPath = ({ kind, id }: RulesOwner) => `/${kind}/${encodeURIComponent(id)}/rules`;

export const getAccountRules = (owner: RulesOwner) =>
  send<{ rules: Rule[]; folders: FolderName[]; categories: Category[] }>("GET", rulesPath(owner));

export const setAccountRules = (owner: RulesOwner, rules: Rule[]) =>
  send<{ ok: true }>("PUT", rulesPath(owner), { rules });

export const applyAccountRule = (owner: RulesOwner, rule: Rule) =>
  send<{ changed: number }>("POST", `${rulesPath(owner)}/apply`, { rule });

export const listMigrations = () => send<Migration[]>("GET", "/migrations");

export const createMigration = (input: { accountId: string; fileName: string; size: number }) =>
  send<Migration>("POST", "/migrations", input);

/** One piece of the file; on a mismatch the server says how much it has. */
export const sendPiece = async (id: string, offset: number, piece: Blob) => {
  const response = await fetch(
    `/api/company/migrations/${encodeURIComponent(id)}/file?offset=${offset}`,
    { method: "PUT", credentials: "same-origin", body: piece },
  );
  const body = (await response.json().catch(() => ({}))) as { received?: number; error?: string };
  if (response.ok || response.status === 409) return { received: body.received ?? offset };
  throw new Error(body.error ?? String(response.status));
};

export const retryMigration = (id: string) =>
  send<{ status: string }>("POST", `/migrations/${encodeURIComponent(id)}/retry`);

export const listSyncs = () => send<MailSync[]>("GET", "/syncs");

export const createSync = (input: {
  accountId: string;
  provider: ProviderId;
  host?: string;
  port?: number;
  login: string;
  password: string;
}) => send<MailSync>("POST", "/syncs", input);

export const runSync = (id: string) =>
  send<{ ok: true }>("POST", `/syncs/${encodeURIComponent(id)}/run`);

export const setSyncPassword = (id: string, password: string) =>
  send<{ ok: true }>("PUT", `/syncs/${encodeURIComponent(id)}/password`, { password });

export const finishSync = (id: string) =>
  send<{ ok: true }>("POST", `/syncs/${encodeURIComponent(id)}/finish`);

export type M365State = {
  connected: boolean;
  tenantId?: string;
  users: { login: string; name: string; address: string }[];
  error?: string;
};

export const getM365 = () => send<M365State>("GET", "/syncs/m365");

export const connectM365 = (credentials: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}) => send<{ ok: true }>("PUT", "/syncs/m365", credentials);
