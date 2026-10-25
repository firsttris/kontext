/**
 * Handing a call on (Weitervermitteln). A call lives in its LiveKit room, so handing it on is
 * about who is in the room:
 * - to a colleague: it rings for them; when they take it they join the room and it is theirs, and
 *   the one who handed it over leaves once they are there;
 * - to a number or a telephone at the Fritzbox ("**610"): the box dials it into the same room;
 *   once it is answered the one handing over leaves, and the two talk through the room.
 */

import { everyone } from "./lines";
import { dialTarget, offerCall, outgoingCall, type PhoneCall, takeOffer } from "./phone";
import type { ToBox } from "./protocol";
import type { Problem } from "./service";
import type { PhoneStore } from "./store";

export type TransferContext = {
  store: Pick<PhoneStore, "call" | "settings">;
  save: (call: PhoneCall) => Promise<void>;
  send: (call: PhoneCall, message: ToBox) => boolean;
  newId: () => string;
  now: () => Date;
};

export type TransferTarget = { to: string; join?: boolean } | { number: string };

export const createTransfers = ({ store, save, send, newId, now }: TransferContext) => {
  /** The call I am talking on, or why not. */
  const mine = async (callId: string, me: string): Promise<PhoneCall | Problem> => {
    const call = await store.call(callId);
    if (!call || call.member !== me) return "not-found";
    return call.state === "talking" ? call : "busy";
  };

  const toColleague = async (call: PhoneCall, me: string, to: string, join: boolean) => {
    if (!everyone(await store.settings()).includes(to)) return "not-allowed" as const;
    const offered = offerCall(call, me, to, join);
    if (!offered) return "busy" as const;
    await save(offered);
    return offered;
  };

  const toNumber = async (call: PhoneCall, me: string, number: string) => {
    const desks = (await store.settings()).deskPhones.map((desk) => desk.extension);
    const target = dialTarget(number, desks);
    if (!target) return "bad-number" as const;
    const leg = outgoingCall({
      id: newId(),
      boxId: call.boxId,
      member: me,
      remote: target.remote,
      room: call.room!,
      at: now().toISOString(),
    });
    await save(leg);
    if (!send(leg, { type: "dial", call: leg.id, room: leg.room!, number: target.dial })) {
      return "offline" as const;
    }
    return leg;
  };

  return {
    /** To a colleague (the call, now offered) or a number (the new line into the room). */
    transfer: async (
      callId: string,
      me: string,
      target: TransferTarget,
    ): Promise<PhoneCall | Problem> => {
      const call = await mine(callId, me);
      if (typeof call === "string") return call;
      return "to" in target
        ? toColleague(call, me, target.to, target.join ?? false)
        : toNumber(call, me, target.number);
    },

    /** The colleague takes the call handed to them. */
    take: async (callId: string, me: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || call.offeredTo !== me) return "not-found";
      const taken = takeOffer(call, me);
      if (!taken) return "busy";
      await save(taken);
      return taken;
    },

    /** Changed one's mind: the call stays with the one who offered it. */
    cancel: async (callId: string, me: string): Promise<PhoneCall | Problem> => {
      const call = await store.call(callId);
      if (!call || (call.offeredBy !== me && call.offeredTo !== me)) return "not-found";
      const kept = { ...call, offeredTo: null, offeredBy: null, offeredJoin: false };
      await save(kept);
      return kept;
    },
  };
};
