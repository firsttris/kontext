/**
 * The demo's JMAP endpoint: the session (RFC 8620 §2) and the API (§3) on the store, with result
 * references (§3.7). Methods the demo does not hold yet answer as an empty server would – nothing
 * there, every change accepted – so every screen opens.
 */
import { CAPABILITIES } from "@/jmap/client";
import { collectionGet, collectionSet } from "./collections";
import { cardGet, cardQuery, cardSet } from "./contacts";
import { emailCopy, emailGet, emailQuery, emailSet, threadGet } from "./emails";
import { eventGet, eventParse, eventQuery, eventSet } from "./events";
import { emailImport } from "./import";
import { mailboxGet, mailboxSet } from "./mailboxes";
import type { Created, Result } from "./methods";
import { principalAvailability, principalGet, principalQuery } from "./principals";
import { identityGet, quotaGet, submissionGet, submissionQuery, submissionSet } from "./sending";
import { type Store, visibleAccounts } from "./store";

type Args = Record<string, unknown>;
type Invocation = [string, Args, string];

const ACCOUNT_CAPABILITIES = {
  [CAPABILITIES.mail]: { maxMailboxesPerEmail: null, maxSizeAttachmentsPerEmail: 50_000_000 },
  [CAPABILITIES.submission]: { maxDelayedSend: 2_592_000, submissionExtensions: {} },
  [CAPABILITIES.contacts]: { mayCreateAddressBook: true },
  [CAPABILITIES.calendars]: { mayCreateCalendar: true },
  [CAPABILITIES.principals]: {},
  [CAPABILITIES.blob]: {},
  "urn:ietf:params:jmap:quota": {},
};

/** The session as Stalwart 0.16 sends it, with the paths the app rewrites to its own origin. */
export const sessionOf = (store: Store, origin: string) => {
  const accounts = visibleAccounts(store);
  const own = accounts[0]!;
  return {
    capabilities: {
      [CAPABILITIES.core]: { maxSizeUpload: 50_000_000, maxCallsInRequest: 64 },
      ...ACCOUNT_CAPABILITIES,
    },
    accounts: Object.fromEntries(
      accounts.map((account) => [
        account.id,
        {
          name: account.email,
          isPersonal: account.id === own.id,
          isReadOnly: false,
          accountCapabilities: ACCOUNT_CAPABILITIES,
        },
      ]),
    ),
    primaryAccounts: Object.fromEntries(
      [...Object.keys(ACCOUNT_CAPABILITIES), CAPABILITIES.core].map((cap) => [cap, own.id]),
    ),
    username: own.email,
    apiUrl: `${origin}/jmap/`,
    downloadUrl: `${origin}/jmap/download/{accountId}/{blobId}/{name}?accept={type}`,
    uploadUrl: `${origin}/jmap/upload/{accountId}/`,
    eventSourceUrl: `${origin}/jmap/eventsource/?types={types}&closeafter={closeafter}&ping={ping}`,
    state: String(store.state),
  };
};

/** A JSON pointer with `*` over arrays (RFC 8620 §3.7), flattening arrays it collects. */
export const evaluatePointer = (value: unknown, path: string): unknown => {
  const [head, ...rest] = path.split("/").filter(Boolean);
  if (head === undefined) return value;
  if (head === "*" && Array.isArray(value)) {
    return value.flatMap((item) => {
      const found = evaluatePointer(item, rest.join("/"));
      return Array.isArray(found) ? found : [found];
    });
  }
  if (value && typeof value === "object") {
    return evaluatePointer((value as Record<string, unknown>)[head], rest.join("/"));
  }
  return undefined;
};

type Reference = { resultOf: string; name: string; path: string };

const resolveReferences = (args: Args, responses: Invocation[]): Args =>
  Object.fromEntries(
    Object.entries(args).map(([key, value]) => {
      if (!key.startsWith("#")) return [key, value];
      const reference = value as Reference;
      const response = responses.find(
        ([name, , callId]) => callId === reference.resultOf && name === reference.name,
      );
      return [key.slice(1), response ? evaluatePointer(response[1], reference.path) : []];
    }),
  );

/** What a server with nothing of this type answers. */
const emptyMethod = (store: Store, method: string, args: Args): Result | null => {
  const state = String(store.state);
  const base = { accountId: args.accountId };
  if (method === "get") return { ...base, state, list: [], notFound: args.ids ?? [] };
  if (method === "query") {
    return {
      ...base,
      queryState: state,
      canCalculateChanges: false,
      position: 0,
      ids: [],
      total: 0,
    };
  }
  if (method === "changes") {
    return {
      ...base,
      oldState: args.sinceState,
      newState: state,
      hasMoreChanges: false,
      created: [],
      updated: [],
      destroyed: [],
    };
  }
  if (method === "set") {
    const create = (args.create ?? {}) as Record<string, Args>;
    return {
      ...base,
      newState: state,
      created: Object.fromEntries(Object.keys(create).map((key) => [key, { id: `demo-${key}` }])),
      updated: Object.fromEntries(Object.keys(args.update ?? {}).map((id) => [id, null])),
      destroyed: args.destroy ?? [],
    };
  }
  return null;
};

/** Only the accounts in the signed-in person's session (RFC 8620 §3.6.2 accountNotFound). */
const reachable = (store: Store, args: Args) =>
  [args.accountId, args.fromAccountId]
    .filter((id) => id !== undefined)
    .every((id) => visibleAccounts(store).some((account) => account.id === id));

type Method = (store: Store, args: Args, created: Created) => Result | Promise<Result>;

/** The methods with one response each. */
const METHODS: Record<string, Method> = {
  "Mailbox/get": mailboxGet,
  "Mailbox/set": mailboxSet,
  "Email/query": emailQuery,
  "Email/get": emailGet,
  "Email/set": emailSet,
  "Email/import": emailImport,
  "Thread/get": threadGet,
  "Identity/get": identityGet,
  "EmailSubmission/get": submissionGet,
  "EmailSubmission/query": submissionQuery,
  "Quota/get": quotaGet,
  "Calendar/get": (store, args) => collectionGet(store, "calendar", args),
  "Calendar/set": (store, args, created) => collectionSet(store, "calendar", args, created),
  "CalendarEvent/query": eventQuery,
  "CalendarEvent/get": eventGet,
  "CalendarEvent/set": eventSet,
  "CalendarEvent/parse": eventParse,
  "AddressBook/get": (store, args) => collectionGet(store, "addressBook", args),
  "AddressBook/set": (store, args, created) => collectionSet(store, "addressBook", args, created),
  "ContactCard/query": cardQuery,
  "ContactCard/get": cardGet,
  "ContactCard/set": cardSet,
  "Principal/query": principalQuery,
  "Principal/get": principalGet,
  "Principal/getAvailability": principalAvailability,
};

/** The methods that answer twice: the second response is the implicit Email/set. */
const withFollowUp = (
  name: string,
  [first, second]: (Result | null | undefined)[],
): [string, Result][] =>
  second
    ? [
        [name, first!],
        ["Email/set", second],
      ]
    : [[name, first!]];

const call = async (
  store: Store,
  name: string,
  args: Args,
  created: Created,
): Promise<[string, Result][]> => {
  if (!reachable(store, args)) return [["error", { type: "accountNotFound" }]];
  const method = METHODS[name];
  if (method) return [[name, await method(store, args, created)]];
  if (name === "Email/copy") return withFollowUp(name, emailCopy(store, args));
  if (name === "EmailSubmission/set")
    return withFollowUp(name, submissionSet(store, args, created));
  const empty = emptyMethod(store, name.split("/")[1] ?? "", args);
  return [empty ? [name, empty] : ["error", { type: "unknownMethod" }]];
};

/** One JMAP request: the calls in order, each seeing the responses before it. */
export const handleRequest = async (store: Store, body: { methodCalls: Invocation[] }) => {
  const created: Created = new Map();
  const responses: Invocation[] = [];
  for (const [name, args, callId] of body.methodCalls) {
    for (const [responseName, result] of await call(
      store,
      name,
      resolveReferences(args, responses),
      created,
    )) {
      responses.push([responseName, result, callId]);
    }
  }
  return { methodResponses: responses, sessionState: String(store.state) };
};
