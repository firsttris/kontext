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

type SetResult = { notUpdated?: Record<string, { description?: string; type?: string }> | null };

export const createCalendars = (request: StalwartRequest) => {
  /** The calendars of several accounts, with `shareWith`, in one request. */
  const list = async (accountIds: string[]): Promise<Record<string, CalendarShare[]>> => {
    if (!accountIds.length) return {};
    const responses = await request(
      accountIds.map((accountId, index) => [
        "Calendar/get",
        { accountId, properties: ["shareWith"] },
        String(index),
      ]),
      CALENDARS,
    );
    return Object.fromEntries(
      accountIds.map((id, index) => [id, (responses[index]![1].list as CalendarShare[]) ?? []]),
    );
  };

  const apply = async (patches: CalendarPatches): Promise<Result<number>> => {
    const accounts = Object.entries(patches);
    if (!accounts.length) return { ok: true, value: 0 };
    const responses = await request(
      accounts.map(([accountId, update], index) => [
        "Calendar/set",
        { accountId, update },
        String(index),
      ]),
      CALENDARS,
    );
    const failed = responses
      .flatMap(([, args]) => Object.values((args as SetResult).notUpdated ?? {}))
      .map((error) => error.description ?? error.type)[0];
    if (failed) return { ok: false, error: `Kalender: ${failed}` };
    return {
      ok: true,
      value: accounts.reduce((sum, [, update]) => sum + Object.keys(update).length, 0),
    };
  };

  return {
    /** A new person in the company (`people` includes them). */
    welcome: async (newcomer: string, people: string[]) =>
      apply(newcomerPatches(newcomer, await list(people))),
    /** Every calendar of `people` shows every colleague; the number of calendars changed. */
    showEveryone: async (people: string[]) => apply(everyonePatches(await list(people))),
  };
};

export type Calendars = ReturnType<typeof createCalendars>;
