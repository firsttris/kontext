/**
 * The call this app is in, and who said no to calls: one for the whole app, so a call goes on
 * while one switches between mail and chat. The live connection reports the "no"s.
 */
import { useSyncExternalStore } from "react";

export type ActiveCall = {
  channelId: string;
  token: string;
  /** LiveKit's address; Kontext's own (Caddy and Vite pass /rtc on) when the server names none. */
  url: string;
  video: boolean;
  /** When this app joined (ms), for how long it has been ringing. */
  joinedAt: number;
  /** A confidential channel's call: sound and picture end-to-end encrypted with this key. */
  e2eeKey?: string;
};

type State = {
  active: ActiveCall | null;
  /** Who turned down a call, by channel (heard live; the caller stops ringing). */
  declinedBy: Record<string, string[]>;
  /** Calls I turned down here: they stop ringing, until that call ends. */
  declined: string[];
};

let state: State = { active: null, declinedBy: {}, declined: [] };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

export const enterCall = (active: ActiveCall) =>
  set({ active, declinedBy: { ...state.declinedBy, [active.channelId]: [] } });

export const leaveCall = () => set({ active: null });

export const heardDeclined = (channelId: string, memberId: string) =>
  set({
    declinedBy: {
      ...state.declinedBy,
      [channelId]: [...new Set([...(state.declinedBy[channelId] ?? []), memberId])],
    },
  });

export const declineHere = (channelId: string) =>
  set({ declined: [...new Set([...state.declined, channelId])] });

/** The call in this channel ended: a next one may ring again. */
export const callEnded = (channelId: string) => {
  if (!state.declined.includes(channelId)) return;
  set({ declined: state.declined.filter((id) => id !== channelId) });
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useCallStore = (): State => useSyncExternalStore(subscribe, () => state);
