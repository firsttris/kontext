/**
 * Which accounts of a person's Stalwart JMAP session are mailboxes for them, and which of those
 * they may change. The session alone does not say: Stalwart 0.16 sends every secondary account
 * with `isPersonal: false, isReadOnly: false` (crates/jmap/src/api/session.rs, "Add secondary
 * accounts"), and lists not only the groups the person is a member of but every account that
 * shared anything with them, an address book say (`access_to` in
 * crates/common/src/auth/access_token.rs).
 *
 * - **Member of a group** (info@ with "Verwalten" or "Lesen und senden"): Stalwart passes
 *   `AccessToken::is_member` into the account capabilities as `mayCreateCalendar`,
 *   `mayCreateAddressBook` and `mayCreateTopLevelFileNode` (session.rs and
 *   `to_account_capabilities` in crates/jmap-proto/src/request/capability.rs). A mailbox, writable.
 * - **Anyone else** sees the account through shared objects only. It is a mailbox when it shows
 *   mail folders (info@ with "Nur lesen", a handed-over mailbox; a shared calendar shows none),
 *   writable when its inbox takes mail (`myRights.mayAddItems`, the effective ACL;
 *   crates/jmap/src/mailbox/get.rs). Otherwise it is no mailbox and left out.
 */
import type { SessionAccount } from "./categories/routes";
import { chunks } from "./migration/pim";

type Capabilities = Record<string, Record<string, unknown> | undefined>;

export type JmapSessionAccount = {
  name?: string;
  isPersonal?: boolean;
  accountCapabilities?: Capabilities;
};

/** A mail folder as `Mailbox/get` returns it, with the person's rights on it (RFC 8621 §2). */
export type Folder = { role?: string | null; myRights?: { mayAddItems?: boolean } };

/** The mail folders of each account the person can see, null where Stalwart would not say. */
export type FoldersOf = (accountIds: string[]) => Promise<Record<string, Folder[] | null>>;

const MEMBER_FLAGS: [string, string][] = [
  ["urn:ietf:params:jmap:calendars", "mayCreateCalendar"],
  ["urn:ietf:params:jmap:contacts", "mayCreateAddressBook"],
  ["urn:ietf:params:jmap:filenode", "mayCreateTopLevelFileNode"],
];

/** Whether Stalwart counts the person as a member of this (secondary) account. */
export const isMember = (account: JmapSessionAccount): boolean =>
  MEMBER_FLAGS.some(
    ([capability, flag]) => account.accountCapabilities?.[capability]?.[flag] === true,
  );

/** A non-member's account seen through its folders: no folders, no mailbox. */
export const readOnlyByFolders = (folders: Folder[] | null | undefined): boolean | null =>
  folders?.length
    ? !folders.some((folder) => folder.role === "inbox" && folder.myRights?.mayAddItems === true)
    : null;

/** The mailbox accounts of a JMAP session, in its order, with what the person may do there. */
export const accountRights = async (
  accounts: Record<string, JmapSessionAccount>,
  foldersOf: FoldersOf,
): Promise<SessionAccount[]> => {
  const entries = Object.entries(accounts);
  const others = entries
    .filter(([, account]) => !account.isPersonal && !isMember(account))
    .map(([id]) => id);
  const folders = others.length ? await foldersOf(others) : {};
  return entries.flatMap(([id, account]): SessionAccount[] => {
    const base = { id, isPersonal: Boolean(account.isPersonal), name: account.name };
    if (account.isPersonal || isMember(account)) return [{ ...base, isReadOnly: false }];
    const readOnly = readOnlyByFolders(folders[id]);
    return readOnly === null ? [] : [{ ...base, isReadOnly: readOnly }];
  });
};

type MethodResponse = [string, { list?: Folder[] }, string];

/**
 * Stalwart takes at most `maxCallsInRequest` calls per request (`maxMethodCalls`, default 16,
 * crates/registry/src/schema/structs_impl.rs) and refuses a longer one as a whole.
 */
export const DEFAULT_CALLS_PER_REQUEST = 16;

/** The limit as the session states it (RFC 8620 §2, `urn:ietf:params:jmap:core`). */
export const callsPerRequest = (session: {
  capabilities?: Record<string, { maxCallsInRequest?: number } | undefined>;
}): number =>
  session.capabilities?.["urn:ietf:params:jmap:core"]?.maxCallsInRequest ??
  DEFAULT_CALLS_PER_REQUEST;

/**
 * `foldersOf` as the person, a `Mailbox/get` per account and at most `perRequest` of them per
 * request; a request that fails costs only its own accounts.
 */
export const createFoldersOf =
  (
    apiUrl: string,
    authorization: string,
    get: typeof fetch = fetch,
    perRequest = DEFAULT_CALLS_PER_REQUEST,
  ): FoldersOf =>
  async (accountIds) => {
    const batch = async (ids: string[]): Promise<[string, Folder[] | null][]> => {
      const response = await get(apiUrl, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        body: JSON.stringify({
          using: ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail"],
          methodCalls: ids.map((accountId) => [
            "Mailbox/get",
            { accountId, properties: ["role", "myRights"] },
            accountId,
          ]),
        }),
      }).catch(() => null);
      const answer = response?.ok
        ? ((await response.json().catch(() => null)) as {
            methodResponses?: MethodResponse[];
          } | null)
        : null;
      const lists = new Map(
        (answer?.methodResponses ?? [])
          .filter(([name]) => name === "Mailbox/get")
          .map(([, args, id]) => [id, args.list ?? []]),
      );
      return ids.map((id) => [id, lists.get(id) ?? null]);
    };
    const batches = await Promise.all(chunks(accountIds, Math.max(1, perRequest)).map(batch));
    return Object.fromEntries(batches.flat());
  };
