/**
 * The company's calendars with the server's key, for free and busy times in the company. Needs
 * the `impersonate` permission like the mailstore: with it Stalwart treats the key as member of
 * every account (`AccessToken::is_member`, crates/common/src/auth/access_token.rs).
 */
import type { Result } from "./accounts";
import {
  type CalendarPatches,
  type CalendarShare,
  everyonePatches,
  newcomerPatches,
} from "./availability";
import type { StalwartRequest } from "./management";

const CALENDARS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];

/**
 * Stalwart takes at most this many calls per request (`maxMethodCalls`, default 16,
 * crates/registry/src/schema/structs_impl.rs); one call per account.
 */
const CALLS_PER_REQUEST = 16;

type SetResult = { notUpdated?: Record<string, { description?: string; type?: string }> | null };

const pieces = <T>(items: T[]): T[][] =>
  Array.from({ length: Math.ceil(items.length / CALLS_PER_REQUEST) }, (_, i) =>
    items.slice(i * CALLS_PER_REQUEST, (i + 1) * CALLS_PER_REQUEST),
  );

export const createCalendars = (request: StalwartRequest) => {
  /** The calendars of several accounts, with `shareWith`, a request per 16 accounts. */
  const list = async (accountIds: string[]): Promise<Record<string, CalendarShare[]>> => {
    const result: Record<string, CalendarShare[]> = {};
    for (const piece of pieces(accountIds)) {
      const responses = await request(
        piece.map((accountId) => [
          "Calendar/get",
          { accountId, properties: ["shareWith"] },
          accountId,
        ]),
        CALENDARS,
      );
      for (const [, args, accountId] of responses) {
        result[accountId] = (args.list as CalendarShare[]) ?? [];
      }
    }
    return result;
  };

  /** Writes the patches; the number of calendars changed. */
  const apply = async (patches: CalendarPatches): Promise<number> => {
    const accounts = Object.entries(patches);
    for (const piece of pieces(accounts)) {
      const responses = await request(
        piece.map(([accountId, update]) => ["Calendar/set", { accountId, update }, accountId]),
        CALENDARS,
      );
      const failed = responses
        .flatMap(([, args]) => Object.values((args as SetResult).notUpdated ?? {}))
        .map((error) => error.description ?? error.type)[0];
      if (failed) throw new Error(failed);
    }
    return accounts.reduce((sum, [, update]) => sum + Object.keys(update).length, 0);
  };

  /** Stalwart's refusals (and a server that cannot be reached) as values, not exceptions. */
  const attempt = async (work: () => Promise<number>): Promise<Result<number>> => {
    try {
      return { ok: true, value: await work() };
    } catch (error) {
      return { ok: false, error: `Kalender: ${(error as Error).message}` };
    }
  };

  return {
    /** A new person in the company (`people` includes them). */
    welcome: (newcomer: string, people: string[]) =>
      attempt(async () => apply(newcomerPatches(newcomer, await list(people)))),
    /** Every calendar of `people` shows every colleague; the number of calendars changed. */
    showEveryone: (people: string[]) =>
      attempt(async () => apply(everyonePatches(await list(people)))),
  };
};

export type Calendars = ReturnType<typeof createCalendars>;
