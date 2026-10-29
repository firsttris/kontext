/**
 * Abmelden nach Inaktivität: on computers several people share, Kontext signs out after a time
 * without input that the Firmenverwaltung sets. Shortly before, it asks „Angemeldet bleiben?“.
 *
 * The moment of the last input is shared by every tab of the browser (through localStorage):
 * typing in one tab keeps the others signed in, and a tab opened again after the time has run out
 * (the browser was closed, not signed out) signs out at once instead of starting anew.
 */

export type IdlePhase = "active" | "warning" | "expired";

/** The choices in the Firmenverwaltung, in minutes; 0 switches it off (the default). */
export const IDLE_MINUTES = [0, 15, 30, 60, 240, 480] as const;

/** How long „Angemeldet bleiben?“ waits for an answer; at most half the time for short ones. */
export const WARNING_MS = 60_000;

export const warningMs = (timeoutMs: number): number => Math.min(WARNING_MS, timeoutMs / 2);

/** Where the time stands `now`, after the last input at `lastActive`. */
export const idlePhase = (now: number, lastActive: number, timeoutMs: number): IdlePhase => {
  const left = lastActive + timeoutMs - now;
  if (left <= 0) return "expired";
  return left <= warningMs(timeoutMs) ? "warning" : "active";
};

/** Milliseconds until the phase changes next (the warning, then the sign-out). */
export const untilNextPhase = (now: number, lastActive: number, timeoutMs: number): number => {
  const expiresAt = lastActive + timeoutMs;
  const warnsAt = expiresAt - warningMs(timeoutMs);
  return Math.max(0, (now < warnsAt ? warnsAt : expiresAt) - now);
};

/** Whole seconds left before the sign-out at `expiresAt`, for the countdown. */
export const secondsLeft = (now: number, expiresAt: number): number =>
  Math.max(0, Math.ceil((expiresAt - now) / 1000));

/** „0:59“, „4:00“. */
export const countdownText = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** The moment of the last input, as every tab sees it. */
export type IdleStore = { read: () => number | null; write: (at: number) => void };

export const IDLE_STORAGE_KEY = "kontext.lastActive";

/**
 * The store in localStorage; in memory where the browser refuses it (private windows, blocked
 * site data), then each tab counts for itself.
 */
export const storageIdleStore = (storage: () => Storage | undefined): IdleStore => {
  let memory: number | null = null;
  return {
    read: () => {
      try {
        const value = Number(storage()?.getItem(IDLE_STORAGE_KEY));
        return value > 0 ? value : memory;
      } catch {
        return memory;
      }
    },
    write: (at) => {
      memory = at;
      try {
        storage()?.setItem(IDLE_STORAGE_KEY, String(at));
      } catch {
        // Kept in memory above.
      }
    },
  };
};

/** Inputs closer together than this are written once: a moving mouse writes once a second. */
const ACTIVITY_STEP = 1000;

/**
 * An input while the sign-out is off: still written, so that switching it on later counts from
 * the last input, not from the sign-in hours ago (which would sign out at once).
 */
export const recordActivity = (store: IdleStore, at: number): void => {
  const last = store.read();
  if (last === null || at - last >= ACTIVITY_STEP) store.write(at);
};

export type IdleTimer = {
  /** An input in this tab; ignored once the question is up, which wants an answer. */
  activity: () => void;
  /** „Angemeldet bleiben“: the time starts anew. */
  stay: () => void;
  /** Looks at the store again (another tab wrote, the tab came back into view). */
  check: () => void;
  phase: () => IdlePhase;
  /** When the sign-out falls, after the last input known. */
  expiresAt: () => number;
  stop: () => void;
};

/**
 * The state machine active → warning → expired, on the time in `store`. `onPhase` hears every
 * change; expired is final and stops the timer.
 */
export const createIdleTimer = ({
  timeoutMs,
  store,
  onPhase,
  now = Date.now,
}: {
  timeoutMs: number;
  store: IdleStore;
  onPhase: (phase: IdlePhase) => void;
  now?: () => number;
}): IdleTimer => {
  const lastActive = () => {
    const stored = store.read();
    if (stored !== null) return stored;
    const at = now();
    store.write(at);
    return at;
  };
  let phase: IdlePhase = "active";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const check = () => {
    if (phase === "expired") return;
    clearTimeout(timer);
    const last = lastActive();
    const next = idlePhase(now(), last, timeoutMs);
    if (next !== phase) {
      phase = next;
      onPhase(next);
    }
    if (next !== "expired") timer = setTimeout(check, untilNextPhase(now(), last, timeoutMs));
  };

  const touch = () => {
    const at = now();
    const last = lastActive();
    // A late timer (a tab in the background) must not let a first input skip the question.
    if (idlePhase(at, last, timeoutMs) !== "active") return check();
    if (at - last < ACTIVITY_STEP) return;
    store.write(at);
    check();
  };

  check();
  return {
    activity: () => {
      if (phase === "active") touch();
    },
    stay: () => {
      if (phase === "expired") return;
      store.write(now());
      check();
    },
    check,
    phase: () => phase,
    expiresAt: () => lastActive() + timeoutMs,
    stop: () => clearTimeout(timer),
  };
};
