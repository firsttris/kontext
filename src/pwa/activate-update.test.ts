import { describe, expect, it, vi } from "vitest";
import { activateUpdate, FALLBACK_MS, type UpdateDeps } from "./activate-update";

const setup = (waiting: boolean) => {
  const worker = { postMessage: vi.fn() };
  const listeners: (() => void)[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  const deps: UpdateDeps = {
    waiting: async () => (waiting ? worker : null),
    onControllerChange: (listener) => listeners.push(listener),
    reload: vi.fn(),
    later: (run, ms) => timers.push({ run, ms }),
  };
  return { deps, worker, listeners, timers };
};

describe("Neu laden", () => {
  it("lets the waiting worker in and loads the page again once it controls", async () => {
    const { deps, worker, listeners } = setup(true);
    await activateUpdate(deps);
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(deps.reload).not.toHaveBeenCalled();
    for (const listener of listeners) listener();
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("loads the page again when another tab already let the new version in", async () => {
    const { deps } = setup(false);
    await activateUpdate(deps);
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });

  it("loads the page anyway when the browser never reports the new controller", async () => {
    const { deps, listeners, timers } = setup(true);
    await activateUpdate(deps);
    expect(timers.map((timer) => timer.ms)).toEqual([FALLBACK_MS]);
    for (const timer of timers) timer.run();
    for (const listener of listeners) listener();
    expect(deps.reload).toHaveBeenCalledTimes(1);
  });
});
