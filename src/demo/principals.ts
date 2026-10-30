/**
 * The company's people and shared mailboxes (JMAP Sharing, RFC 9670) and their busy times
 * (Principal/getAvailability, draft-ietf-jmap-calendars). As in Stalwart, a principal's id is
 * its account id, and the login is its name, the full name its description.
 */
import { eventsBetween } from "./events";
import { type Args, getList, type Result, state } from "./methods";
import type { DemoAccount, Store, StoredObject } from "./store";

const principalOf = (account: DemoAccount) => ({
  id: account.id,
  type: account.isGroup ? "group" : "individual",
  name: account.id,
  description: account.fullName,
  email: account.email,
});

export const principalQuery = (store: Store, args: Args): Result => ({
  accountId: args.accountId,
  queryState: state(store),
  canCalculateChanges: false,
  position: 0,
  ids: store.accounts.map((account) => account.id),
  total: store.accounts.length,
});

export const principalGet = (store: Store, args: Args): Result => ({
  accountId: args.accountId,
  state: state(store),
  ...getList(store.accounts, args, principalOf),
});

/** Declined, or marked free: not busy (crates/jmap/src/principal/availability.rs). */
const isBusy = (event: StoredObject, email: string) => {
  if (event.freeBusyStatus === "free") return false;
  const own = Object.values(
    (event.participants ?? {}) as Record<
      string,
      { calendarAddress?: string; participationStatus?: string }
    >,
  ).find((participant) => participant.calendarAddress?.toLowerCase() === `mailto:${email}`);
  return own?.participationStatus !== "declined";
};

export const principalAvailability = (store: Store, args: Args): Result => {
  const account = store.accounts.find((candidate) => candidate.id === args.id);
  const list = account
    ? eventsBetween(store, account.id, String(args.utcStart), String(args.utcEnd))
        .filter((event) => !event.showWithoutTime && isBusy(event, account.email))
        .map((event) => ({
          utcStart: event.utcStart,
          utcEnd: event.utcEnd,
          busyStatus: "confirmed",
          event: { id: event.id },
        }))
    : [];
  return { list };
};
