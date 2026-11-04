/**
 * What Kontext needs in Stalwart, set up idempotently: the OAuth client `kontext` with the scope
 * `full`, directory queries, and the role, account and API key of the Kontext server
 * (docs/installation.md). Used by the admin's command (server/setup-stalwart.ts) and by the dev
 * Stalwart (dev/stalwart.ts). The pure functions compute what is missing from what Stalwart
 * returns; the `ensure…` functions read, apply that and say in German what they did.
 *
 * Objects and properties: crates/registry/src/schema/structs.rs of stalwartlabs/stalwart v1.0.3
 * (OAuthClient, Sharing, Role, UserAccount, Credential, SecondaryCredential, CustomRoles), the
 * permission names in crates/registry/src/schema/enums_impl.rs (Permission::as_str).
 */
import type { Result } from "./company/accounts";
import { firstError, type Invocation, type SetResult } from "./company/management";
import { CLIENT_ID, REDIRECT_URI } from "./stalwart";

/** One management request (x:<Object>/get|set), as the admin or as the Kontext server. */
export type Request = (methodCalls: Invocation[]) => Promise<Invocation[]>;

/** The calls that bring Stalwart to the wanted state (none: it is there) and what they do. */
export type Plan = { calls: Invocation[]; message: string };

export const ROLE_NAME = "Kontext-Server";
export const ACCOUNT_NAME = "kontext-server";

/** The rights the Kontext server's key needs beside those of User (docs/installation.md). */
export const KONTEXT_SERVER_RIGHTS = [
  "sysAccountGet",
  "sysAccountQuery",
  "sysAccountCreate",
  "sysAccountUpdate",
  "sysRoleGet",
  "sysRoleCreate",
  "sysDomainGet",
  "sysAuthenticationGet",
  "sysIndexQueueStatusGet",
  "impersonate",
] as const;

export type OAuthClient = { id: string; clientId: string; scopes?: Record<string, boolean> };
export type Role = {
  id: string;
  description: string;
  roleIds?: Record<string, boolean>;
  enabledPermissions?: Record<string, boolean>;
};
export type Domain = { id: string; name: string };
type Credential = { "@type": string };
export type Account = {
  id: string;
  "@type": string;
  name: string;
  domainId: string;
  roles?: { "@type": string; roleIds?: Record<string, boolean> };
  credentials?: Record<string, Credential> | Credential[];
};

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });
const none = (message: string): Plan => ({ calls: [], message });

/**
 * Kontext signs in as the OAuth client `kontext` with the scope `full` (server/stalwart.ts);
 * Stalwart 1.0 refuses clients it does not know and, since 1.0.3, scopes a client does not allow
 * (crates/http/src/auth/oauth/authorize.rs). A client made before 1.0.3 gets `full` added.
 */
export const oauthClientPlan = (clients: OAuthClient[]): Plan => {
  const known = clients.find((client) => client.clientId === CLIENT_ID);
  if (known?.scopes?.full) return none(`OAuth-Client „${CLIENT_ID}“ ist schon eingerichtet.`);
  if (known)
    return {
      calls: [["x:OAuthClient/set", { update: { [known.id]: { "scopes/full": true } } }, "0"]],
      message: `OAuth-Client „${CLIENT_ID}“: Scope full ergänzt.`,
    };
  const client = {
    clientId: CLIENT_ID,
    description: "Kontext",
    redirectUris: { [REDIRECT_URI]: true },
    scopes: { full: true },
  };
  return {
    calls: [["x:OAuthClient/set", { create: { kontext: client } }, "0"]],
    message: `OAuth-Client „${CLIENT_ID}“ angelegt (Scope full).`,
  };
};

/**
 * The colleagues for sharing, the chat and free times come from Principal/query, which Stalwart
 * 1.0 answers only with `allowDirectoryQueries` (crates/jmap/src/principal/query.rs); the setting
 * takes effect after ReloadSettings (an x:Action).
 */
export const directoryQueriesPlan = (sharing: { allowDirectoryQueries?: boolean }): Plan =>
  sharing.allowDirectoryQueries
    ? none("Verzeichnisabfragen sind schon erlaubt.")
    : {
        calls: [
          ["x:Sharing/set", { update: { singleton: { allowDirectoryQueries: true } } }, "0"],
          ["x:Action/set", { create: { r: { "@type": "ReloadSettings" } } }, "1"],
        ],
        message: "Verzeichnisabfragen erlaubt, Einstellungen neu geladen.",
      };

const trueMap = (keys: readonly string[]): Record<string, true> =>
  Object.fromEntries(keys.map((key) => [key, true as const]));

/** The role `Kontext-Server`: created, or given the inherited User roles and rights it lacks. */
export const rolePlan = (roles: Role[], userRoleIds: string[]): Plan => {
  const role = roles.find((candidate) => candidate.description === ROLE_NAME);
  if (!role) {
    const create = {
      description: ROLE_NAME,
      roleIds: trueMap(userRoleIds),
      enabledPermissions: trueMap(KONTEXT_SERVER_RIGHTS),
    };
    return {
      calls: [["x:Role/set", { create: { role: create } }, "0"]],
      message: `Rolle „${ROLE_NAME}“ angelegt.`,
    };
  }
  const rights = KONTEXT_SERVER_RIGHTS.filter((right) => !role.enabledPermissions?.[right]);
  const inherited = userRoleIds.filter((id) => !role.roleIds?.[id]);
  if (!rights.length && !inherited.length)
    return none(`Rolle „${ROLE_NAME}“ gibt es schon, mit allen Rechten.`);
  const patch = Object.fromEntries([
    ...rights.map((right) => [`enabledPermissions/${right}`, true]),
    ...inherited.map((id) => [`roleIds/${id}`, true]),
  ]);
  const added = [...rights, ...(inherited.length ? ["erbt User"] : [])].join(", ");
  return {
    calls: [["x:Role/set", { update: { [role.id]: patch } }, "0"]],
    message: `Rolle „${ROLE_NAME}“ gibt es schon; ergänzt: ${added}.`,
  };
};

/** The domain for `kontext-server@…`: the one asked for, or the only one there is. */
export const pickDomain = (domains: Domain[], wanted?: string): Result<Domain> => {
  if (wanted) {
    const domain = domains.find((candidate) => candidate.name === wanted.toLowerCase());
    return domain ? ok(domain) : fail(`Die Domain ${wanted} gibt es in Stalwart nicht.`);
  }
  if (domains.length === 1) return ok(domains[0]!);
  if (!domains.length)
    return fail("In Stalwart gibt es noch keine Domain; zuerst die Domain anlegen (Schritt 1).");
  const names = domains.map((domain) => domain.name).join(", ");
  return fail(`Stalwart hat mehrere Domains (${names}); eine mit --domain <name> wählen.`);
};

export const findAccount = (accounts: Account[], domain: Domain): Account | undefined =>
  accounts.find(
    (account) =>
      account["@type"] === "User" &&
      account.name === ACCOUNT_NAME &&
      account.domainId === domain.id,
  );

const passwordCredential = (password: string) => ({
  "0": { "@type": "Password", secret: password },
});

/**
 * The account `kontext-server@<domain>` with the role (in place of User, which the role
 * inherits): created with the password, or given the role it lacks (UserRoles, CustomRoles).
 */
export const accountPlan = (
  account: Account | undefined,
  domain: Domain,
  roleId: string,
  password: string,
): Plan => {
  const address = `${ACCOUNT_NAME}@${domain.name}`;
  if (!account) {
    const create = {
      "@type": "User",
      name: ACCOUNT_NAME,
      domainId: domain.id,
      description: "Kontext-Server (Firmenverwaltung)",
      roles: { "@type": "Custom", roleIds: { [roleId]: true } },
      credentials: passwordCredential(password),
    };
    return {
      calls: [["x:Account/set", { create: { account: create } }, "0"]],
      message: `Konto ${address} angelegt.`,
    };
  }
  if (account.roles?.["@type"] === "Custom" && account.roles.roleIds?.[roleId])
    return none(`Konto ${address} gibt es schon, mit der Rolle „${ROLE_NAME}“.`);
  const roleIds = account.roles?.["@type"] === "Custom" ? (account.roles.roleIds ?? {}) : {};
  return {
    calls: [
      [
        "x:Account/set",
        {
          update: {
            [account.id]: { roles: { "@type": "Custom", roleIds: { ...roleIds, [roleId]: true } } },
          },
        },
        "0",
      ],
    ],
    message: `Konto ${address} gibt es schon; Rolle „${ROLE_NAME}“ ergänzt.`,
  };
};

/** Whether the account already has an API key (Credential::ApiKey). */
export const hasApiKey = (account: Account): boolean =>
  Object.values(account.credentials ?? {}).some((credential) => credential["@type"] === "ApiKey");

/**
 * The account's password, newly set so the runner can sign in as the account and make its key:
 * only for an account without a key, so the list holds nothing else that matters.
 */
export const passwordPlan = (account: Account, password: string): Invocation[] => [
  [
    "x:Account/set",
    { update: { [account.id]: { credentials: passwordCredential(password) } } },
    "0",
  ],
];

/** An API key that inherits the account's rights (CredentialPermissions::Inherit). */
export const API_KEY_CALL: Invocation = [
  "x:ApiKey/set",
  { create: { key: { description: "Kontext", permissions: { "@type": "Inherit" } } } },
  "0",
];

export const envLine = (secret: string): string => `STALWART_ADMIN_KEY=${secret}`;

/** The first refusal in a set response, or what was created. */
const setOutcome = (responses: Invocation[]): Result<SetResult> => {
  for (const [name, args] of responses) {
    if (name === "error") return fail(String(args.description ?? args.type));
    const error = firstError(args as SetResult);
    if (error) return fail(error);
  }
  return ok((responses[0]?.[1] ?? {}) as SetResult);
};

/** Runs a plan; its message, or Stalwart's reason for refusing it. */
export const applyPlan = async (request: Request, plan: Plan): Promise<Result<SetResult>> =>
  plan.calls.length ? setOutcome(await request(plan.calls)) : ok({});

const getList = async <T>(request: Request, call: Invocation): Promise<T[]> =>
  ((await request([call]))[0]?.[1].list ?? []) as T[];

const withMessage = async (
  request: Request,
  plan: Plan,
  subject: string,
): Promise<Result<string>> => {
  const result = await applyPlan(request, plan);
  return result.ok ? ok(plan.message) : fail(`${subject}: ${result.error}`);
};

export const ensureOAuthClient = async (request: Request): Promise<Result<string>> => {
  const clients = await getList<OAuthClient>(request, [
    "x:OAuthClient/get",
    { ids: null, properties: ["clientId", "scopes"] },
    "0",
  ]);
  return withMessage(request, oauthClientPlan(clients), `OAuth-Client „${CLIENT_ID}“`);
};

export const ensureDirectoryQueries = async (request: Request): Promise<Result<string>> => {
  const [sharing = {}] = await getList<{ allowDirectoryQueries?: boolean }>(request, [
    "x:Sharing/get",
    { ids: ["singleton"], properties: ["allowDirectoryQueries"] },
    "0",
  ]);
  return withMessage(request, directoryQueriesPlan(sharing), "Verzeichnisabfragen");
};

/** The role's id, after creating it or filling in its rights. */
export const ensureRole = async (
  request: Request,
): Promise<Result<{ id: string; message: string }>> => {
  const [auth] = await getList<{ defaultUserRoleIds?: Record<string, boolean> }>(request, [
    "x:Authentication/get",
    { ids: ["singleton"], properties: ["defaultUserRoleIds"] },
    "0",
  ]);
  const roles = await getList<Role>(request, [
    "x:Role/get",
    { ids: null, properties: ["description", "roleIds", "enabledPermissions"] },
    "0",
  ]);
  const plan = rolePlan(roles, Object.keys(auth?.defaultUserRoleIds ?? {}));
  const result = await applyPlan(request, plan);
  if (!result.ok) return fail(`Rolle „${ROLE_NAME}“: ${result.error}`);
  const id = result.value.created?.role?.id ?? roles.find((r) => r.description === ROLE_NAME)?.id;
  return id ? ok({ id, message: plan.message }) : fail(`Rolle „${ROLE_NAME}“ nicht angelegt.`);
};

export type ServerAccountOutcome = { messages: string[]; key?: string };

/**
 * The account `kontext-server@<domain>` with the role and one API key. The key is made by the
 * account itself (x:ApiKey belongs to the signed-in account, crates/jmap/src/registry/mapping/
 * account.rs), so the runner signs in with the random password; Stalwart shows the key's secret
 * only in this answer. An account that has a key keeps it: no second one is made.
 */
export const ensureServerAccount = async (
  request: Request,
  requestAs: (login: string, password: string) => Request,
  options: { roleId: string; domain?: string; newPassword: () => string },
): Promise<Result<ServerAccountOutcome>> => {
  const domains = await getList<Domain>(request, [
    "x:Domain/get",
    { ids: null, properties: ["name"] },
    "0",
  ]);
  const domain = pickDomain(domains, options.domain);
  if (!domain.ok) return domain;
  const accounts = await getList<Account>(request, [
    "x:Account/get",
    { ids: null, properties: ["@type", "name", "domainId", "roles", "credentials"] },
    "0",
  ]);
  const account = findAccount(accounts, domain.value);
  const address = `${ACCOUNT_NAME}@${domain.value.name}`;
  const password = options.newPassword();
  const plan = accountPlan(account, domain.value, options.roleId, password);
  const applied = await applyPlan(request, plan);
  if (!applied.ok) return fail(`Konto ${address}: ${applied.error}`);
  if (account && hasApiKey(account))
    return ok({
      messages: [
        plan.message,
        `Konto ${address} hat schon einen API-Schlüssel; es wird kein zweiter angelegt. Ist er verloren: in Stalwart beim Konto löschen, dann den Befehl noch einmal ausführen.`,
      ],
    });
  if (account) {
    const reset = setOutcome(await request(passwordPlan(account, password)));
    if (!reset.ok) return fail(`Konto ${address}, neues Passwort: ${reset.error}`);
  }
  const key = setOutcome(await requestAs(address, password)([API_KEY_CALL]));
  if (!key.ok) return fail(`API-Schlüssel für ${address}: ${key.error}`);
  const secret = (key.value.created?.key as { secret?: string } | undefined)?.secret;
  if (!secret) return fail(`API-Schlüssel für ${address}: Stalwart hat keinen geliefert.`);
  return ok({ messages: [plan.message, `API-Schlüssel für ${address} angelegt.`], key: secret });
};
