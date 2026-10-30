/**
 * Who belongs to the caller's shared mailboxes, for "Zuweisen": JMAP's Principal has no members
 * (crates/jmap-proto/src/object/principal.rs in stalwartlabs/stalwart v1.0.1), so the server reads
 * them with its own key. Everyone signed in sees only the mailboxes they are a member of, and of
 * those only the members who can still sign in.
 */
import { type Company, type Roles, toCompany } from "./accounts";
import type { CompanyDeps } from "./context";

/** Mailbox id → its members' ids, for the mailboxes `email` belongs to. Pure. */
export const membersOfOwnMailboxes = (
  company: Pick<Company, "employees" | "mailboxes">,
  email: string,
): Record<string, string[]> => {
  const self = company.employees.find((e) => e.email.toLowerCase() === email.toLowerCase());
  if (!self?.active) return {};
  // A locked account stays in the group (Austritt deletes nothing) but can no longer work a mail.
  const active = new Set(company.employees.filter((e) => e.active).map((e) => e.id));
  return Object.fromEntries(
    company.mailboxes
      .filter((mailbox) => mailbox.memberIds.includes(self.id))
      .map((mailbox) => [mailbox.id, mailbox.memberIds.filter((id) => active.has(id))]),
  );
};

/** null when nobody is signed in. */
export const readMailboxMembers = ({ management, currentEmail }: CompanyDeps) => {
  let roles: Roles | undefined;
  return async (request: Request): Promise<Record<string, string[]> | null> => {
    const email = await currentEmail(request);
    if (!email) return null;
    roles ??= await management.loadRoles();
    const [accounts, domains] = await Promise.all([
      management.listAccounts(),
      management.listDomains(),
    ]);
    return membersOfOwnMailboxes(toCompany(accounts, roles, domains), email);
  };
};
