/**
 * Tests only: Stalwart 0.16's JMAP session and `Mailbox/get` for a few people, behind a stubbed
 * `fetch`, and Kontext's own `createSessionInfo` on top. Shaped like
 * crates/jmap/src/api/session.rs: every secondary account has `isPersonal: false, isReadOnly:
 * false`; only a member's carry `mayCreateCalendar: true`.
 */
import { vi } from "vitest";
import type { Folder } from "./account-rights";
import type { Auth, Grants } from "./auth";
import type { Env } from "./env";
import { createSessionInfo } from "./session-info";

const STALWART = "http://stalwart.test";

/** How someone sees another account: as a group member, or through what it shared (its folders). */
export type Seen = { member: true } | { folders: Folder[] };

/** The inbox as "Nur lesen" shares it, and as a hand-over does. */
export const readOnlyInbox: Folder = {
  role: "inbox",
  myRights: { mayAddItems: false },
};
export const writableInbox: Folder = { role: "inbox", myRights: { mayAddItems: true } };

const accountOf = (name: string, isPersonal: boolean, member: boolean) => ({
  name,
  isPersonal,
  isReadOnly: false,
  accountCapabilities: {
    "urn:ietf:params:jmap:mail": {},
    "urn:ietf:params:jmap:calendars": { mayCreateCalendar: member },
  },
});

const sessionOf = (own: string, others: Record<string, Seen>) => ({
  apiUrl: `${STALWART}/jmap/`,
  primaryAccounts: { "urn:ietf:params:jmap:mail": own },
  accounts: {
    [own]: accountOf(`${own}@w.test`, true, true),
    ...Object.fromEntries(
      Object.entries(others).map(([id, seen]) => [
        id,
        accountOf(`${id}@w.test`, false, "member" in seen),
      ]),
    ),
  },
});

type MethodCall = [string, { accountId: string }, string];

/** Stalwart's answer to the person: folders they may see, none of an account that shared none. */
const answer = (others: Record<string, Seen>, calls: MethodCall[]) =>
  calls.map(([name, { accountId }, id]) => {
    // Each account sends as its own address; the name stays empty (so the address is the name).
    if (name === "Identity/get")
      return [name, { list: [{ email: `${accountId}@W.test`, name: "" }] }, id];
    if (name !== "Mailbox/get") return [name, { list: [] }, id];
    const seen = others[accountId];
    const list = !seen ? [] : "member" in seen ? [writableInbox] : seen.folders;
    return [name, { accountId, list }, id];
  });

/** `createSessionInfo` for these people (their sign-in session id is their name). */
export const sampleSessionInfo = (people: Record<string, Record<string, Seen>>) => {
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const who = new Headers(init?.headers).get("authorization")!.replace("Bearer ", "");
    const others = people[who] ?? {};
    if (String(url).endsWith("/jmap/session")) return Response.json(sessionOf(who, others));
    const { methodCalls } = JSON.parse(String(init?.body)) as { methodCalls: MethodCall[] };
    return Response.json({ methodResponses: answer(others, methodCalls) });
  });
  const auth = {
    api: {
      getSession: async ({ headers }: { headers: Headers }) => {
        const who = headers.get("x-who");
        return who ? { session: { id: who }, user: { email: `${who}@w.test` } } : null;
      },
    },
  } as unknown as Auth;
  const grants = { accessToken: async (sessionId: string) => sessionId } as unknown as Grants;
  return createSessionInfo({ STALWART_URL: STALWART } as Env, auth, grants);
};

/** A request from this person. */
export const requestOf = (who: string) =>
  new Request("http://kontext.test/", { headers: { "x-who": who } });
