/**
 * The company's shared mailboxes with their people, read with Stalwart's admin key the way the
 * Firmenverwaltung reads them (company/accounts.ts): members are in the group, readers have its
 * folders shared with them. Kept for half a minute; a change in the Firmenverwaltung clears it, and
 * a read that was under way then is not kept.
 */
import { toCompany } from "../company/accounts";
import type { Mailstore } from "../company/mailstore";
import type { Management } from "../company/management";
import type { MailboxPeople } from "./mailboxes";

const FRESH_MS = 30_000;

export const createCompanyMailboxes = ({
  management,
  mailstore,
  now = Date.now,
}: {
  management: Management;
  mailstore: Pick<Mailstore, "listFolders">;
  now?: () => number;
}) => {
  let cached: { mailboxes: MailboxPeople[]; until: number } | null = null;

  const read = async (): Promise<MailboxPeople[]> => {
    const [accounts, roles, domains] = await Promise.all([
      management.listAccounts(),
      management.loadRoles(),
      management.listDomains(),
    ]);
    const plain = toCompany(accounts, roles, domains);
    const folders = await mailstore.listFolders(plain.mailboxes.map((mailbox) => mailbox.id));
    const company = toCompany(accounts, roles, domains, folders);
    const emailOf = new Map(
      company.employees.filter((e) => e.active).map((e) => [e.id, e.email.toLowerCase()]),
    );
    const addresses = (ids: string[], role: "edit" | "view") =>
      ids.flatMap((id) => {
        const email = emailOf.get(id);
        return email ? [{ email, role }] : [];
      });
    return company.mailboxes.map((mailbox) => ({
      id: mailbox.id,
      email: mailbox.email.toLowerCase(),
      people: [...addresses(mailbox.memberIds, "edit"), ...addresses(mailbox.readerIds, "view")],
    }));
  };

  // Counts the changes: a read that began before one never fills the cache with what it saw.
  let generation = 0;

  return {
    load: async () => {
      if (cached && cached.until > now()) return cached.mailboxes;
      const began = generation;
      const mailboxes = await read();
      if (began === generation) cached = { mailboxes, until: now() + FRESH_MS };
      return mailboxes;
    },
    forget: () => {
      generation += 1;
      cached = null;
    },
  };
};
