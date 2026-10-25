/**
 * What every Firmenverwaltung request works with: the company as Stalwart has it now, the caller,
 * and the helpers to look things up and answer. Loaded fresh per request (a few accounts).
 */

import type { Context } from "hono";
import { z } from "zod";
import type { CategoryStore } from "../categories/store";
import type { MigrationDeps } from "../migration/routes";
import type { SyncDeps } from "../migration/sync-routes";
import {
  type Company,
  isCompanyUser,
  type Roles,
  type StalwartAccount,
  toCompany,
} from "./accounts";
import type { Calendars } from "./calendars";
import type { Mailstore } from "./mailstore";
import type { Management } from "./management";
import type { CompanySettings } from "./settings";
import type { Folder } from "./sharing";

export type CompanyDeps = {
  management: Management;
  mailstore: Mailstore;
  /** Free and busy times of the company's calendars. */
  calendars: Calendars;
  settings: CompanySettings;
  /** Categories of the shared mailboxes, for the rules that set them. */
  categories: CategoryStore;
  migrations: MigrationDeps;
  syncs: SyncDeps;
  /** The signed-in user's address, or null. */
  currentEmail: (request: Request) => Promise<string | null>;
  /** Ends the user's Kontext sessions (after deactivating or a new password). */
  endSessions: (email: string) => Promise<void>;
  random?: (size: number) => Uint8Array;
  /** How long the team chat keeps messages; changing it takes out what is older at once. */
  chatRetention?: { days: () => Promise<number>; setDays: (days: number) => Promise<void> };
  pruneChat?: () => Promise<number>;
  /** After a shared mailbox's members or readers changed (its folder in Dokumente follows). */
  mailboxChanged?: (mailboxId: string) => void;
  /** For the check of the domains' mail security (security.ts). */
  security?: {
    publicUrl: string;
    resolve: import("./security").Resolve;
    fetchPolicy?: (url: string) => Promise<string | null>;
  };
};

export type Loaded = {
  company: Company;
  accounts: StalwartAccount[];
  /** Folders of the shared mailboxes, with `shareWith`. */
  folders: Record<string, Folder[]>;
  roles: Roles;
  selfId: string;
};

export type Env = { Variables: { loaded: Loaded } };
export type Ctx = Context<Env>;

const sameAddress = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** Loads the company for a request; null when the caller may not use the Firmenverwaltung. */
export const createLoader = ({ management, mailstore, currentEmail }: CompanyDeps) => {
  let roles: Roles | undefined;
  return async (request: Request, { folders = true } = {}): Promise<Loaded | null> => {
    const email = await currentEmail(request);
    if (!email) return null;
    roles ??= await management.loadRoles();
    const [accounts, domains] = await Promise.all([
      management.listAccounts(),
      management.listDomains(),
    ]);
    const plain = toCompany(accounts, roles, domains);
    const self = plain.employees.find((e) => sameAddress(e.email, email));
    if (!self?.admin || !self.active) return null;
    const groupFolders = folders
      ? await mailstore.listFolders(plain.mailboxes.map((mailbox) => mailbox.id))
      : {};
    return {
      company: toCompany(accounts, roles, domains, groupFolders),
      accounts,
      folders: groupFolders,
      roles,
      selfId: self.id,
    };
  };
};

export const bad = (error: string) => Response.json({ error }, { status: 400 });
export const notFound = () => Response.json({ error: "Nicht gefunden" }, { status: 404 });

/** The request body checked against a schema, or null. */
export const bodyOf = async <T>(c: Ctx, schema: z.ZodType<T>): Promise<T | null> => {
  const parsed = schema.safeParse(await c.req.json().catch(() => null));
  return parsed.success ? parsed.data : null;
};

export const usersOf = (loaded: Loaded) =>
  loaded.accounts.filter((account) => isCompanyUser(account, loaded.roles));
export const userOf = (loaded: Loaded, id: string) => usersOf(loaded).find((a) => a.id === id);
export const mailboxOf = (loaded: Loaded, id: string) =>
  loaded.company.mailboxes.find((mailbox) => mailbox.id === id);

export const fullName = z.string().trim().min(1).max(200);
export const addresses = z.array(z.string().trim().max(320)).max(50);
export const ids = z.array(z.string().max(64)).max(500);
