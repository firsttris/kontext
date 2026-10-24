/**
 * The company's people and shared mailboxes, read from Stalwart's management objects and turned
 * into what the Firmenverwaltung shows, and back into patches. Pure functions; the calls are in
 * management.ts. Source of the object shapes: crates/registry/src/schema/structs.rs
 * (UserAccount, GroupAccount, EmailAlias, PasswordCredential, Permissions, UserRoles) in
 * stalwartlabs/stalwart v0.16.27.
 */
import { type Folder, readersOf } from "./sharing";

export type Domain = { id: string; name: string };

type RoleRef = { "@type": "User" | "Admin" | "Custom" | "Default"; roleIds?: Record<string, true> };
type PermissionsRef = {
  "@type": "Inherit" | "Merge" | "Replace";
  enabledPermissions?: Record<string, true>;
  disabledPermissions?: Record<string, true>;
};
type AliasRef = { name: string; domainId: string; enabled?: boolean; description?: string | null };

/** One account as `x:Account/get` returns it (the properties used here). */
export type StalwartAccount = {
  id: string;
  "@type": "User" | "Group";
  name: string;
  domainId: string;
  description?: string | null;
  emailAddress?: string;
  roles?: RoleRef;
  permissions?: PermissionsRef;
  credentials?: Record<string, { "@type": string; otpAuth?: string | null }>;
  memberGroupIds?: Record<string, true>;
  aliases?: Record<string, AliasRef>;
  usedDiskQuota?: number;
  quotas?: Record<string, number>;
};

/** What decides who belongs to the company and who may manage it. */
export type Roles = {
  /** The role every user has by default (x:Authentication defaultUserRoleIds). */
  userRoleIds: string[];
  /** Kontext's own role "Firmenverwaltung": no permissions, only the mark. */
  companyRoleId: string;
};

export type Employee = {
  id: string;
  email: string;
  fullName: string;
  active: boolean;
  admin: boolean;
  twoFactor: boolean;
  mailboxIds: string[];
  aliases: string[];
  usedBytes: number;
  quotaBytes: number | null;
};

export type SharedMailbox = {
  id: string;
  email: string;
  description: string;
  aliases: string[];
  memberIds: string[];
  /** People who only read (folders shared with them), not members. */
  readerIds: string[];
  usedBytes: number;
};

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

const keys = (map: Record<string, unknown> | undefined): string[] => Object.keys(map ?? {});

const addressOf = (account: StalwartAccount, domains: Domain[]): string =>
  account.emailAddress ??
  `${account.name}@${domains.find((d) => d.id === account.domainId)?.name ?? ""}`;

const aliasAddresses = (account: StalwartAccount, domains: Domain[]): string[] =>
  Object.values(account.aliases ?? {}).flatMap((alias) => {
    const domain = domains.find((d) => d.id === alias.domainId);
    return domain ? [`${alias.name}@${domain.name}`] : [];
  });

/**
 * Users with the normal user role, with or without the company mark. Stalwart's own admins and
 * accounts with other roles stay out of the Firmenverwaltung (they belong to the operator).
 */
export const isCompanyUser = (account: StalwartAccount, roles: Roles): boolean => {
  if (account["@type"] !== "User") return false;
  const role = account.roles?.["@type"] ?? "User";
  if (role === "User") return true;
  if (role !== "Custom") return false;
  const allowed = new Set([...roles.userRoleIds, roles.companyRoleId]);
  return keys(account.roles?.roleIds).every((id) => allowed.has(id));
};

export const isCompanyAdmin = (account: StalwartAccount, roles: Roles): boolean =>
  isCompanyUser(account, roles) &&
  account.roles?.["@type"] === "Custom" &&
  Boolean(account.roles.roleIds?.[roles.companyRoleId]);

/** Shared mailboxes are groups with the default group role. */
export const isSharedMailbox = (account: StalwartAccount): boolean =>
  account["@type"] === "Group" && (account.roles?.["@type"] ?? "Default") === "Default";

const isActive = (account: StalwartAccount): boolean =>
  !account.permissions?.disabledPermissions?.authenticate;

const hasTwoFactor = (account: StalwartAccount): boolean =>
  Object.values(account.credentials ?? {}).some(
    (credential) => credential["@type"] === "Password" && Boolean(credential.otpAuth),
  );

export const toEmployee = (
  account: StalwartAccount,
  roles: Roles,
  domains: Domain[],
): Employee => ({
  id: account.id,
  email: addressOf(account, domains),
  fullName: account.description?.trim() || account.name,
  active: isActive(account),
  admin: isCompanyAdmin(account, roles),
  twoFactor: hasTwoFactor(account),
  mailboxIds: keys(account.memberGroupIds),
  aliases: aliasAddresses(account, domains),
  usedBytes: account.usedDiskQuota ?? 0,
  quotaBytes: account.quotas?.maxDiskQuota ?? null,
});

export const toSharedMailbox = (
  group: StalwartAccount,
  users: StalwartAccount[],
  domains: Domain[],
  folders: Folder[] = [],
): SharedMailbox => {
  const memberIds = users.filter((user) => user.memberGroupIds?.[group.id]).map((u) => u.id);
  return {
    id: group.id,
    email: addressOf(group, domains),
    description: group.description?.trim() ?? "",
    aliases: aliasAddresses(group, domains),
    memberIds,
    readerIds: readersOf(folders).filter(
      (id) => !memberIds.includes(id) && users.some((user) => user.id === id),
    ),
    usedBytes: group.usedDiskQuota ?? 0,
  };
};

export type Company = { domains: Domain[]; employees: Employee[]; mailboxes: SharedMailbox[] };

const byText =
  <T>(text: (item: T) => string) =>
  (a: T, b: T) =>
    text(a).localeCompare(text(b), "de");

export const toCompany = (
  accounts: StalwartAccount[],
  roles: Roles,
  domains: Domain[],
  folders: Record<string, Folder[]> = {},
): Company => {
  const users = accounts.filter((account) => isCompanyUser(account, roles));
  const groups = accounts.filter(isSharedMailbox);
  return {
    domains,
    employees: users.map((u) => toEmployee(u, roles, domains)).sort(byText((e) => e.fullName)),
    mailboxes: groups
      .map((g) => toSharedMailbox(g, users, domains, folders[g.id]))
      .sort(byText((m) => m.email)),
  };
};

/** "Name@Firma.de" → the account name and the domain's id, if the domain is one of ours. */
export const parseAddress = (
  address: string,
  domains: Domain[],
): Result<{ name: string; domainId: string }> => {
  const match = address
    .trim()
    .toLowerCase()
    .match(/^([a-z0-9][a-z0-9._+-]{0,63})@([a-z0-9.-]+)$/);
  if (!match) return fail("Die Adresse ist ungültig.");
  const domain = domains.find((d) => d.name.toLowerCase() === match[2]);
  if (!domain) return fail(`Die Domain ${match[2]} gehört nicht zu diesem Server.`);
  return ok({ name: match[1]!, domainId: domain.id });
};

/** The `aliases` list for a set of addresses (Stalwart's List is a map keyed by position). */
export const aliasesValue = (
  addresses: string[],
  domains: Domain[],
): Result<Record<string, AliasRef>> => {
  const unique = [...new Set(addresses.map((a) => a.trim().toLowerCase()).filter(Boolean))];
  const value: Record<string, AliasRef> = {};
  for (const [index, address] of unique.entries()) {
    const parsed = parseAddress(address, domains);
    if (!parsed.ok) return fail(parsed.error);
    value[String(index)] = { ...parsed.value, enabled: true };
  }
  return ok(value);
};

/** The roles of a user with or without the company mark. */
export const rolesValue = (admin: boolean, roles: Roles): RoleRef =>
  admin
    ? {
        "@type": "Custom",
        roleIds: Object.fromEntries(
          [...roles.userRoleIds, roles.companyRoleId].map((id) => [id, true as const]),
        ),
      }
    : { "@type": "User" };

/**
 * A deactivated user loses the right to sign in (`authenticate`), everywhere: Kontext, IMAP,
 * SMTP, DAV. Mail to the address still arrives, so nothing bounces during an offboarding.
 */
export const permissionsValue = (
  active: boolean,
  current: PermissionsRef | undefined,
): PermissionsRef => {
  const enabled = current?.enabledPermissions ?? {};
  const { authenticate: _, ...disabled } = current?.disabledPermissions ?? {};
  const nextDisabled = active ? disabled : { ...disabled, authenticate: true as const };
  if (!keys(enabled).length && !keys(nextDisabled).length && current?.["@type"] !== "Replace") {
    return { "@type": "Inherit" };
  }
  return {
    "@type": current?.["@type"] === "Replace" ? "Replace" : "Merge",
    enabledPermissions: enabled,
    disabledPermissions: nextDisabled,
  };
};

/** The key of the password in the account's credentials (where the second factor lives too). */
export const passwordKey = (account: StalwartAccount): string | undefined =>
  Object.entries(account.credentials ?? {}).find(([, c]) => c["@type"] === "Password")?.[0];

/** Per user the change of its membership in one group, for a new member list. */
export const membershipPatches = (
  groupId: string,
  memberIds: string[],
  users: StalwartAccount[],
): Record<string, Record<string, true | null>> => {
  const wanted = new Set(memberIds);
  const patches: Record<string, Record<string, true | null>> = {};
  for (const user of users) {
    const isMember = Boolean(user.memberGroupIds?.[groupId]);
    if (isMember !== wanted.has(user.id)) {
      patches[user.id] = { [`memberGroupIds/${groupId}`]: wanted.has(user.id) ? true : null };
    }
  }
  return patches;
};

/**
 * A new password that is easy to read out and type: four groups of letters and digits without
 * look-alikes (no 0/O, 1/l/I). 80 bits; Stalwart's strength check accepts it.
 */
export const newPassword = (random: (size: number) => Uint8Array): string => {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = random(16);
  const chars = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return [0, 4, 8, 12].map((start) => chars.slice(start, start + 4).join("")).join("-");
};
