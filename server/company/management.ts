/**
 * Stalwart's management objects (`x:Account`, `x:Role`, `x:Domain`, `x:Authentication`) with the
 * server's own key. Only this file talks to them; the routes decide what is allowed.
 * Methods: crates/jmap-proto/src/request/method.rs; objects: crates/registry/src/schema/structs.rs.
 */
import type { Domain, Result, Roles, StalwartAccount } from "./accounts";
import type { IndexQueueEntry } from "./search-index";

const USING = ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"];

export type Invocation = [string, Record<string, unknown>, string];

/** The role that marks who may use the Firmenverwaltung; it grants nothing in Stalwart. */
export const COMPANY_ROLE = "Firmenverwaltung (Kontext)";

/** An API key ("API_…") goes as Bearer, "name:password" as Basic. */
export const authorizationFor = (key: string): string =>
  key.startsWith("API_") ? `Bearer ${key}` : `Basic ${Buffer.from(key).toString("base64")}`;

type SetError = { type: string; description?: string; properties?: string[] };
export type SetResult = {
  created?: Record<string, { id: string }>;
  notCreated?: Record<string, SetError>;
  notUpdated?: Record<string, SetError>;
};

/** Stalwart's reasons in words for the Firmenverwaltung. */
export const describeSetError = (error: SetError): string => {
  if (error.type === "primaryKeyViolation") return "Diese Adresse ist schon vergeben.";
  if (error.description) return error.description;
  return `Stalwart lehnt die Änderung ab (${error.type}).`;
};

export const firstError = (result: SetResult): string | undefined => {
  const failed = { ...result.notCreated, ...result.notUpdated };
  const error = Object.values(failed)[0];
  return error ? describeSetError(error) : undefined;
};

/** One JMAP request with the server's key; a method-level error throws with Stalwart's words. */
export const createRequest = (stalwartUrl: string, key: string) => {
  const authorization = authorizationFor(key);
  return async (methodCalls: Invocation[], using = USING): Promise<Invocation[]> => {
    const response = await fetch(`${stalwartUrl}/jmap/`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization },
      body: JSON.stringify({ using, methodCalls }),
    });
    if (!response.ok) throw new Error(`Stalwart-Verwaltung: ${response.status}`);
    const { methodResponses } = (await response.json()) as { methodResponses: Invocation[] };
    for (const [name, args] of methodResponses) {
      if (name === "error") throw new Error(String(args.description ?? args.type));
    }
    return methodResponses;
  };
};

export type StalwartRequest = ReturnType<typeof createRequest>;

/** Uploads a blob into an account (RFC 8620 §6.1); its blobId. */
export const createUpload = (stalwartUrl: string, key: string) => {
  const authorization = authorizationFor(key);
  return async (accountId: string, data: string | Uint8Array, type: string): Promise<string> => {
    const response = await fetch(`${stalwartUrl}/jmap/upload/${encodeURIComponent(accountId)}/`, {
      method: "POST",
      headers: { "content-type": type, authorization },
      body: typeof data === "string" ? data : new Blob([new Uint8Array(data)]),
    });
    if (!response.ok) throw new Error(`Stalwart-Upload: ${response.status}`);
    return ((await response.json()) as { blobId: string }).blobId;
  };
};

export type StalwartUpload = ReturnType<typeof createUpload>;

/** Downloads a blob of an account as text (RFC 8620 §6.2), e.g. a Sieve script. */
export const createDownload = (stalwartUrl: string, key: string) => {
  const authorization = authorizationFor(key);
  return async (accountId: string, blobId: string): Promise<string> => {
    const response = await fetch(
      `${stalwartUrl}/jmap/download/${encodeURIComponent(accountId)}/${encodeURIComponent(blobId)}/blob`,
      { headers: { authorization } },
    );
    if (!response.ok) throw new Error(`Stalwart-Download: ${response.status}`);
    return response.text();
  };
};

export type StalwartDownload = ReturnType<typeof createDownload>;

export const createManagement = (request: StalwartRequest) => {
  const call = async <T>(method: string, args: Record<string, unknown>): Promise<T> =>
    (await request([[method, args, "0"]]))[0]![1] as T;

  const listAccounts = async (): Promise<StalwartAccount[]> =>
    (await call<{ list: StalwartAccount[] }>("x:Account/get", { ids: null })).list;

  const listDomains = async (): Promise<Domain[]> =>
    (await call<{ list: Domain[] }>("x:Domain/get", { ids: null, properties: ["name"] })).list;

  /** The default user roles and the company role, which is created on first use. */
  const loadRoles = async (): Promise<Roles> => {
    const [auth, roles] = await request([
      ["x:Authentication/get", { ids: ["singleton"], properties: ["defaultUserRoleIds"] }, "a"],
      ["x:Role/get", { ids: null, properties: ["description"] }, "r"],
    ]);
    const userRoleIds = Object.keys(
      (auth![1].list as { defaultUserRoleIds: Record<string, true> }[])[0]?.defaultUserRoleIds ??
        {},
    );
    const existing = (roles![1].list as { id: string; description: string }[]).find(
      (role) => role.description === COMPANY_ROLE,
    );
    if (existing) return { userRoleIds, companyRoleId: existing.id };
    const created = await call<SetResult>("x:Role/set", {
      create: { r: { description: COMPANY_ROLE } },
    });
    const id = created.created?.r?.id;
    if (!id) throw new Error(firstError(created) ?? "Rolle nicht angelegt");
    return { userRoleIds, companyRoleId: id };
  };

  /** Creates one account; the new id or Stalwart's reason. */
  const createAccount = async (account: Record<string, unknown>): Promise<Result<string>> => {
    const result = await call<SetResult>("x:Account/set", { create: { a: account } });
    const id = result.created?.a?.id;
    return id ? { ok: true, value: id } : { ok: false, error: firstError(result) ?? "Fehler" };
  };

  /** Applies patches to several accounts in one call; all or Stalwart's first reason. */
  const updateAccounts = async (
    patches: Record<string, Record<string, unknown>>,
  ): Promise<Result<null>> => {
    if (!Object.keys(patches).length) return { ok: true, value: null };
    const result = await call<SetResult>("x:Account/set", { update: patches });
    const error = firstError(result);
    return error ? { ok: false, error } : { ok: true, value: null };
  };

  /**
   * What waits for the search index (search-index.ts); null when the key may not read it
   * (`sysIndexQueueStatusGet`, docs/installation.md) or Stalwart is older than 1.0.
   */
  const indexQueue = async (): Promise<IndexQueueEntry[] | null> =>
    call<{ list: IndexQueueEntry[] }>("x:IndexQueueStatus/get", { ids: null })
      .then((result) => result.list ?? [])
      .catch(() => null);

  return { listAccounts, listDomains, loadRoles, createAccount, updateAccounts, indexQueue };
};

export type Management = ReturnType<typeof createManagement>;
