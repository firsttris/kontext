import { describe, expect, it } from "vitest";
import type { Importer } from "./importer";
import { createSyncRunner } from "./sync-runner";
import type { Sync, Syncs } from "./syncs";

/** Syncs whose `get` waits until the test lets it go, so a run stays "in progress". */
const heldSyncs = () => {
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const syncs = {
    get: async () => {
      await held;
      return { status: "finished" } as Sync;
    },
  } as unknown as Syncs;
  return { syncs, release };
};

const runnerWith = (syncs: Syncs) =>
  createSyncRunner({
    syncs,
    importer: {} as Importer,
    sealer: { seal: async (text) => text, open: async (text) => text },
  });

describe("settled", () => {
  it("is true at once for a move without a run", async () => {
    expect(await runnerWith(heldSyncs().syncs).settled("x", 10)).toBe(true);
  });

  it("waits for the move's run in progress and says when it is over", async () => {
    const { syncs, release } = heldSyncs();
    const runner = runnerWith(syncs);
    void runner.enqueue("x");
    expect(await runner.settled("x", 10)).toBe(false);
    const over = runner.settled("x", 1000);
    release();
    expect(await over).toBe(true);
    expect(await runner.settled("x", 10)).toBe(true);
  });
});
