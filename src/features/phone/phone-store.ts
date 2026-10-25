/**
 * The phone call this app is in, and the ringing calls hidden here: one for the whole app, so a
 * call goes on while one switches to the contact or the mail.
 */
import { useSyncExternalStore } from "react";

export type ActivePhone = {
  callId: string;
  token: string;
  url: string;
};

type State = { active: ActivePhone | null; dismissed: string[] };

let state: State = { active: null, dismissed: [] };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

export const enterPhone = (active: ActivePhone) => set({ active });
export const leavePhone = () => set({ active: null });
export const dismissPhone = (callId: string) =>
  set({ dismissed: [...new Set([...state.dismissed, callId])] });

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePhoneStore = (): State => useSyncExternalStore(subscribe, () => state);
