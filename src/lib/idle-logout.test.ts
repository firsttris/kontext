import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  countdownText,
  createIdleTimer,
  IDLE_STORAGE_KEY,
  type IdlePhase,
  type IdleStore,
  idlePhase,
  secondsLeft,
  storageIdleStore,
  untilNextPhase,
  warningMs,
} from "./idle-logout";

const MINUTE = 60_000;

describe("idlePhase", () => {
  it("warns in the last minute and expires at the time", () => {
    const timeout = 15 * MINUTE;
    expect(idlePhase(14 * MINUTE - 1, 0, timeout)).toBe("active");
    expect(idlePhase(14 * MINUTE, 0, timeout)).toBe("warning");
    expect(idlePhase(15 * MINUTE - 1, 0, timeout)).toBe("warning");
    expect(idlePhase(15 * MINUTE, 0, timeout)).toBe("expired");
  });

  it("warns for at most half of a short time", () => {
    expect(warningMs(15 * MINUTE)).toBe(MINUTE);
    expect(warningMs(10_000)).toBe(5000);
    expect(idlePhase(4999, 0, 10_000)).toBe("active");
    expect(idlePhase(5000, 0, 10_000)).toBe("warning");
  });
});

describe("untilNextPhase and the countdown", () => {
  it("names the time to the warning, then to the sign-out", () => {
    expect(untilNextPhase(0, 0, 15 * MINUTE)).toBe(14 * MINUTE);
    expect(untilNextPhase(14 * MINUTE + 1000, 0, 15 * MINUTE)).toBe(59_000);
    expect(untilNextPhase(16 * MINUTE, 0, 15 * MINUTE)).toBe(0);
  });

  it("counts whole seconds down", () => {
    expect(secondsLeft(14 * MINUTE + 500, 15 * MINUTE)).toBe(60);
    expect(secondsLeft(15 * MINUTE + 5, 15 * MINUTE)).toBe(0);
    expect(countdownText(59)).toBe("0:59");
    expect(countdownText(60)).toBe("1:00");
    expect(countdownText(5)).toBe("0:05");
  });
});

describe("storageIdleStore", () => {
  it("shares the moment through the storage", () => {
    const storage = new Map<string, string>();
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => void storage.set(key, value),
    } as unknown as Storage;
    expect(storageIdleStore(() => fake).read()).toBeNull();
    storageIdleStore(() => fake).write(1234);
    expect(storage.get(IDLE_STORAGE_KEY)).toBe("1234");
    expect(storageIdleStore(() => fake).read()).toBe(1234);
  });

  it("keeps the moment in memory where the browser refuses the storage", () => {
    const refusing = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    } as unknown as Storage;
    const store = storageIdleStore(() => refusing);
    expect(store.read()).toBeNull();
    store.write(99);
    expect(store.read()).toBe(99);
  });
});

describe("createIdleTimer", () => {
  const memoryStore = (): IdleStore & { value: number | null } => {
    const store = {
      value: null as number | null,
      read: () => store.value,
      write: (at: number) => {
        store.value = at;
      },
    };
    return store;
  };

  const start = (store = memoryStore(), timeoutMs = 15 * MINUTE) => {
    const phases: IdlePhase[] = [];
    const timer = createIdleTimer({ timeoutMs, store, onPhase: (phase) => phases.push(phase) });
    return { timer, phases, store };
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-29T08:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("goes from active to the warning to expired without input", () => {
    const { timer, phases } = start();
    expect(timer.phase()).toBe("active");
    vi.advanceTimersByTime(14 * MINUTE - 1);
    expect(phases).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(phases).toEqual(["warning"]);
    vi.advanceTimersByTime(MINUTE);
    expect(phases).toEqual(["warning", "expired"]);
    expect(timer.phase()).toBe("expired");
  });

  it("starts anew with every input while active", () => {
    const { timer, phases } = start();
    vi.advanceTimersByTime(10 * MINUTE);
    timer.activity();
    vi.advanceTimersByTime(10 * MINUTE);
    expect(phases).toEqual([]);
    vi.advanceTimersByTime(4 * MINUTE);
    expect(phases).toEqual(["warning"]);
  });

  it("writes a moving mouse at most once a second", () => {
    const store = memoryStore();
    const write = vi.spyOn(store, "write");
    const { timer } = start(store);
    write.mockClear();
    timer.activity();
    vi.advanceTimersByTime(300);
    timer.activity();
    expect(write).not.toHaveBeenCalled();
    vi.advanceTimersByTime(700);
    timer.activity();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it("ignores input during the question; only „Angemeldet bleiben“ answers it", () => {
    const { timer, phases } = start();
    vi.advanceTimersByTime(14 * MINUTE + 10_000);
    timer.activity();
    expect(timer.phase()).toBe("warning");
    timer.stay();
    expect(phases).toEqual(["warning", "active"]);
    vi.advanceTimersByTime(14 * MINUTE - 1);
    expect(timer.phase()).toBe("active");
    vi.advanceTimersByTime(MINUTE + 1);
    expect(timer.phase()).toBe("expired");
  });

  it("follows another tab's input through the shared store", () => {
    const store = memoryStore();
    const { timer, phases } = start(store);
    vi.advanceTimersByTime(14 * MINUTE + 1000);
    store.value = Date.now();
    timer.check();
    expect(phases).toEqual(["warning", "active"]);
  });

  it("signs out at once where the time ran out while no tab was open", () => {
    const store = memoryStore();
    store.value = Date.now() - 20 * MINUTE;
    const { timer, phases } = start(store);
    expect(phases).toEqual(["expired"]);
    timer.stay();
    timer.activity();
    expect(timer.phase()).toBe("expired");
  });

  it("asks rather than letting a late first input skip the question", () => {
    const store = memoryStore();
    const { timer, phases } = start(store);
    // A tab in the background: the timer did not fire, the time went on.
    timer.stop();
    vi.setSystemTime(Date.now() + 14 * MINUTE + 30_000);
    timer.activity();
    expect(phases).toEqual(["warning"]);
  });

  it("stops without a further phase", () => {
    const { timer, phases } = start();
    timer.stop();
    vi.advanceTimersByTime(20 * MINUTE);
    expect(phases).toEqual([]);
    expect(timer.expiresAt()).toBe(Date.now() - 5 * MINUTE);
  });
});
