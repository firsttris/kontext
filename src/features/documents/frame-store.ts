/**
 * What the rail and the sign-out need to know about Schreibzeug's frame, outside of it: unsaved
 * changes, the open document, and a way to tell the frame something.
 */
import { useSyncExternalStore } from "react";
import type { FrameCommand } from "./messages";

type FrameState = { unsaved: boolean; title: string | null };

let state: FrameState = { unsaved: false, title: null };
let send: ((command: FrameCommand) => void) | null = null;
let signedOut: (() => void) | null = null;
const listeners = new Set<() => void>();

export const updateFrame = (next: Partial<FrameState>): void => {
  state = { ...state, ...next };
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useFrameState = (): FrameState => useSyncExternalStore(subscribe, () => state);

/** The frame is there (or gone, with null) and takes commands through this. */
export const connectFrame = (sender: ((command: FrameCommand) => void) | null): void => {
  send = sender;
  if (!sender) updateFrame({ unsaved: false, title: null });
};

/** Schreibzeug confirmed its sign-out. */
export const frameSignedOut = (): void => signedOut?.();

/** How long signing out waits for Schreibzeug before going on without it. */
const SIGN_OUT_WAIT_MS = 2_000;

/**
 * Signs Schreibzeug out with Kontext, before Kontext's own sign-out removes the frame; without a
 * frame, or when it does not answer in time, Kontext goes on.
 */
export const signOutFrame = (): Promise<void> => {
  if (!send) return Promise.resolve();
  const sender = send;
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signedOut = null;
      resolve();
    };
    const timer = setTimeout(done, SIGN_OUT_WAIT_MS);
    signedOut = done;
    sender({ source: "kontext", type: "logout" });
  });
};
