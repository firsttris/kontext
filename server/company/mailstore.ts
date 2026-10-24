/**
 * JMAP inside the company's accounts (folders, out-of-office reply, sender identities, Sieve) with
 * the server's key. Needs the `impersonate` permission: with it Stalwart treats the key as member
 * of every account (`AccessToken::is_member`, crates/common/src/auth/access_token.rs).
 */
import { type FilterAccess, loadFilters, saveFilters, type Vacation } from "../rules/filters";
import type { Result } from "./accounts";
import {
  firstError,
  type SetResult,
  type StalwartDownload,
  type StalwartRequest,
  type StalwartUpload,
} from "./management";
import type { Folder } from "./sharing";

const CORE = "urn:ietf:params:jmap:core";
const MAIL = [CORE, "urn:ietf:params:jmap:mail"];
const SUBMISSION = [...MAIL, "urn:ietf:params:jmap:submission"];
const SIEVE = [CORE, "urn:ietf:params:jmap:sieve"];

export type { Vacation };

export type Identity = {
  id: string;
  name: string;
  email: string;
  textSignature?: string;
  htmlSignature?: string;
};

const setOk = (result: SetResult): Result<null> => {
  const error = firstError(result);
  return error ? { ok: false, error } : { ok: true, value: null };
};

export const createMailstore = (
  request: StalwartRequest,
  upload: StalwartUpload,
  download: StalwartDownload,
) => {
  const call = async <T>(method: string, args: Record<string, unknown>, using: string[]) =>
    (await request([[method, args, "0"]], using))[0]![1] as T;

  /** The folders of several accounts in one request. */
  const listFolders = async (accountIds: string[]): Promise<Record<string, Folder[]>> => {
    if (!accountIds.length) return {};
    const responses = await request(
      accountIds.map((accountId, index) => [
        "Mailbox/get",
        { accountId, properties: ["role", "shareWith"] },
        String(index),
      ]),
      MAIL,
    );
    return Object.fromEntries(
      accountIds.map((id, index) => [id, (responses[index]![1].list as Folder[]) ?? []]),
    );
  };

  const updateFolders = async (
    accountId: string,
    update: Record<string, Record<string, unknown>>,
  ): Promise<Result<null>> =>
    Object.keys(update).length
      ? setOk(await call<SetResult>("Mailbox/set", { accountId, update }, MAIL))
      : { ok: true, value: null };

  /** The reply together with the person's mail rules, which it must not switch off. */
  const filters: FilterAccess = {
    request,
    upload: (accountId, script) => upload(accountId, script, "application/sieve"),
    download,
  };

  const getVacation = async (accountId: string): Promise<Vacation> =>
    (await loadFilters(filters, accountId)).vacation;

  const setVacation = async (accountId: string, vacation: Vacation): Promise<Result<null>> => {
    const { rules } = await loadFilters(filters, accountId);
    const error = await saveFilters(filters, accountId, { rules, vacation });
    return error ? { ok: false, error } : { ok: true, value: null };
  };

  const listIdentities = async (accountId: string): Promise<Identity[]> =>
    (await call<{ list: Identity[] }>("Identity/get", { accountId }, SUBMISSION)).list;

  const updateIdentities = async (
    accountId: string,
    update: Record<string, Partial<Identity>>,
  ): Promise<Result<null>> =>
    Object.keys(update).length
      ? setOk(await call<SetResult>("Identity/set", { accountId, update }, SUBMISSION))
      : { ok: true, value: null };

  /**
   * Puts a Sieve script (RFC 9661) under `name` and activates it. That deactivates the
   * out-of-office script Stalwart keeps for VacationResponse.
   */
  const setSieveScript = async (
    accountId: string,
    name: string,
    content: string,
  ): Promise<Result<null>> => {
    const { list } = await call<{ list: { id: string; name: string }[] }>(
      "SieveScript/get",
      { accountId, properties: ["name"] },
      SIEVE,
    );
    const existing = list.find((script) => script.name === name);
    const blobId = await upload(accountId, content, "application/sieve");
    return setOk(
      await call<SetResult>(
        "SieveScript/set",
        existing
          ? {
              accountId,
              update: { [existing.id]: { blobId } },
              onSuccessActivateScript: existing.id,
            }
          : { accountId, create: { s: { name, blobId } }, onSuccessActivateScript: "#s" },
        SIEVE,
      ),
    );
  };

  return {
    setSieveScript,
    listFolders,
    updateFolders,
    getVacation,
    setVacation,
    listIdentities,
    updateIdentities,
  };
};

export type Mailstore = ReturnType<typeof createMailstore>;
