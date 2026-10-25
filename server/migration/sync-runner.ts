/**
 * Keeps a move from Gmail & Co. going: the first run takes over all mail, later runs (every 15
 * minutes, or on demand) only what is new, one way only; nothing is ever changed or deleted at the
 * old provider. A mail Gmail shows under several labels is imported once and put into each folder.
 * Gmail lets IMAP download about 2.5 GB a day: a big mailbox simply takes several runs.
 */
import type { Sealer } from "../crypto";
import { syncFolder } from "./folder-sync";
import { folderOrder, imapTarget } from "./imap-folders";
import { openImap } from "./imap-source";
import type { Importer } from "./importer";
import type { Graph } from "./m365/graph";
import { runM365 } from "./m365/sync";
import { folderResolver } from "./resolve";
import type { Sync, SyncCounts, Syncs } from "./syncs";

export const SYNC_EVERY_MS = 15 * 60 * 1000;

export type SyncRunnerDeps = {
  syncs: Syncs;
  importer: Importer;
  sealer: Sealer;
  /** Tests against the local Stalwart: IMAP without TLS. */
  allowPlain?: boolean;
  /** The Graph client of the company's Microsoft 365 app, if connected. */
  microsoft?: () => Promise<Graph | null>;
};

export const createSyncRunner = ({
  syncs,
  importer,
  sealer,
  allowPlain = false,
  microsoft,
}: SyncRunnerDeps) => {
  /** A run from an IMAP mailbox (Gmail & Co.). */
  const runImap = async (sync: Sync, counts: SyncCounts): Promise<string | null> => {
    const opened = await openImap(
      { host: sync.host, port: sync.port },
      { user: sync.login, password: await sealer.open(sync.secret) },
      allowPlain,
    );
    if (!opened.ok) {
      if (opened.error.reason !== "login") throw new Error(opened.error.message);
      return "login-failed";
    }
    const source = opened.value;
    try {
      const known = await importer.knownMessageIds(sync.accountId);
      const resolve = folderResolver(
        importer,
        sync.accountId,
        await importer.folders(sync.accountId),
      );
      const folders = (await source.folders())
        .flatMap((folder) => {
          const target = imapTarget(folder);
          return target ? [{ folder, target }] : [];
        })
        .sort((a, b) => folderOrder(a.target, b.target));
      for (const { folder, target } of folders) {
        sync.state[folder.path] = await syncFolder({
          importer,
          source,
          accountId: sync.accountId,
          path: folder.path,
          mailboxId: await resolve(target),
          known,
          counts,
          previous: sync.state[folder.path],
          save: async (state) => {
            sync.state[folder.path] = state;
            await syncs.update(sync.id, { state: sync.state, counts });
          },
        });
      }
      return null;
    } finally {
      await source.close();
    }
  };

  /** A run from Microsoft 365, with the company's app. */
  const runMicrosoft = async (sync: Sync, counts: SyncCounts): Promise<string | null> => {
    const graph = await microsoft?.();
    if (!graph) throw new Error("Microsoft 365 ist nicht (mehr) verbunden.");
    await runM365({
      graph,
      importer,
      accountId: sync.accountId,
      user: sync.login,
      state: sync.state,
      counts,
      save: () => syncs.update(sync.id, { state: sync.state, counts }),
    });
    return null;
  };

  const run = async (id: string): Promise<void> => {
    const sync = await syncs.get(id);
    if (sync?.status !== "active") return;
    await syncs.update(id, { status: "running", lastError: null });
    const counts = { ...sync.counts };
    try {
      const failed = await (sync.provider === "m365" ? runMicrosoft : runImap)(sync, counts);
      await syncs.update(id, {
        status: failed ? "login-failed" : "active",
        state: sync.state,
        counts,
        lastRunAt: new Date(),
        lastError: failed
          ? "Die Anmeldung wurde abgelehnt. Wurde das (App-)Passwort geändert? Bitte neu eintragen."
          : null,
      });
    } catch (error) {
      await syncs.update(id, {
        status: "active",
        counts,
        lastRunAt: new Date(),
        lastError: (error as Error).message,
      });
    }
  };

  // One run at a time, so a small server and the provider's limits are not overrun.
  let queue = Promise.resolve();
  const pending = new Map<string, Promise<void>>();
  const enqueue = (id: string) => {
    const queued = pending.get(id);
    if (queued) return queued;
    const done = queue
      .then(() => run(id))
      .catch(() => undefined)
      .finally(() => pending.delete(id));
    pending.set(id, done);
    queue = done;
    return done;
  };

  /**
   * Whether the move's queued or running run is over, waiting at most `ms`: finishing a move
   * waits for the run just asked for instead of refusing it (a first run may take hours).
   */
  const settled = async (id: string, ms: number): Promise<boolean> => {
    const queued = pending.get(id);
    if (!queued) return true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    });
    const over = await Promise.race([queued.then(() => true as const), late]);
    clearTimeout(timer);
    return over;
  };

  /** Every minute: the active moves whose last run is older than 15 minutes. */
  const start = async () => {
    for (const sync of await syncs.list()) {
      if (sync.status === "running") await syncs.update(sync.id, { status: "active" });
    }
    const tick = async () => {
      for (const sync of await syncs.list()) {
        const due = !sync.lastRunAt || Date.now() - sync.lastRunAt.getTime() >= SYNC_EVERY_MS;
        if (sync.status === "active" && due) void enqueue(sync.id);
      }
    };
    void tick();
    return setInterval(() => void tick(), 60_000);
  };

  return { enqueue, settled, start };
};

export type SyncRunner = ReturnType<typeof createSyncRunner>;
