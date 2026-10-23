/**
 * The Firmenverwaltung's calls to the Sekretär server (/api/company, server/company/routes.ts).
 * Unlike mail, contacts and calendar this is not JMAP: the server works with its own Stalwart key.
 */
import type {
  Company as CompanyData,
  Employee,
  SharedMailbox,
} from "../../../server/company/accounts";

export type { Employee, SharedMailbox };
export type Company = CompanyData & { selfId: string };

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
export type NewMailbox = { email: string; description: string; memberIds: string[] };
export type MailboxChange = Partial<{
  description: string;
  aliases: string[];
  memberIds: string[];
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

export const createMailbox = (mailbox: NewMailbox) =>
  send<{ id: string }>("POST", "/mailboxes", mailbox);

export const updateMailbox = (id: string, change: MailboxChange) =>
  send<{ ok: true }>("PATCH", `/mailboxes/${encodeURIComponent(id)}`, change);
