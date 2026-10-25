/**
 * Fetches new mail of external accounts (Gmail, GMX, …) into the person's Stalwart account: every
 * two minutes, or on demand, the provider's inbox over IMAP, read-only. Only mail newer than the
 * connection comes over (unless the person asked for the old inbox too); Kontext leads afterwards:
 * read, moved or deleted in Kontext stays in Kontext, the provider keeps its copy untouched.
 */
import type { Sealer } from "../crypto";
import { syncFolder } from "../migration/folder-sync";
import { type MailHead, openImap } from "../migration/imap-source";
import type { Importer } from "../migration/importer";
import type { FolderState } from "../migration/syncs";
import type { ExternalAccount, ExternalStore } from "./store";

export const FETCH_EVERY_MS = 2 * 60 * 1000;
const INBOX = "INBOX";

export type FetcherDeps = {
  store: ExternalStore;
  importer: Importer;
  sealer: Sealer;
  /** Tests against a local server: IMAP without TLS, any port. */
  allowPlain?: boolean;
  now?: () => number;
};

const DAY_MS = 86_400_000;

/**
 * How far back to look for mails the account already has (against duplicates): for new mail only
 * the day before the oldest of it – a copy that also came straight to Stalwart arrived about then;
 * on a first run or after the provider rebuilt the inbox (new UIDVALIDITY, every mail listed
 * again) the whole account (null).
 */
export const checkSince = (
  previous: FolderState | undefined,
  uidValidity: string,
  heads: Pick<MailHead, "internalDate">[],
  now: Date,
): Date | null => {
  if (!previous || previous.uidValidity !== uidValidity) return null;
  const oldest = Math.min(
    now.getTime(),
    ...heads.flatMap((head) => (head.internalDate ? [head.internalDate.getTime()] : [])),
  );
  return new Date(oldest - DAY_MS);
};

/** Whether an account is due for its next fetch. */
export const isDue = (account: ExternalAccount, now: number): boolean =>
  account.status === "active" &&
  (!account.lastRunAt || now - account.lastRunAt.getTime() >= FETCH_EVERY_MS);

export const createFetcher = ({
  store,
  importer,
  sealer,
  allowPlain = false,
  now = Date.now,
}: FetcherDeps) => {
  /** The folder the mails go into: the inbox, or one named after the address (made once). */
  const targetOf = async (account: ExternalAccount): Promise<string> => {
    const folders = await importer.folders(account.accountId);
    if (account.target === "inbox") {
      const inbox = folders.find((folder) => folder.role === "inbox");
      if (!inbox) throw new Error("Das Konto hat keinen Posteingang.");
      return inbox.id;
    }
    const kept = folders.find((folder) => folder.id === account.folderId);
    if (kept) return kept.id;
    const named = folders.find((f) => f.name === account.email && f.parentId === null);
    const id = named?.id ?? (await importer.createFolder(account.accountId, account.email, null));
    await store.update(account.id, { folderId: id });
    return id;
  };

  /** One run; null, or "login-failed" when the provider refused the password. */
  const fetchOne = async (account: ExternalAccount): Promise<string | null> => {
    const opened = await openImap(
      { host: account.imapHost, port: account.imapPort },
      { user: account.login, password: await sealer.open(account.secret) },
      allowPlain,
    );
    if (!opened.ok) {
      if (opened.error.reason !== "login") throw new Error(opened.error.message);
      return "login-failed";
    }
    const source = opened.value;
    try {
      const previous = account.state ?? undefined;
      const peek = await source.newUids(INBOX, previous?.lastUid ?? 0);
      if (previous && peek.uidValidity === previous.uidValidity && !peek.uids.length) return null;
      const incremental = previous?.uidValidity === peek.uidValidity;
      const heads = incremental ? await source.heads(INBOX, peek.uids) : [];
      const since = checkSince(previous, peek.uidValidity, heads, new Date(now()));
      const known = await importer.knownMessageIds(account.accountId, since ?? undefined);
      const counts = { ...account.counts };
      const state = await syncFolder({
        importer,
        source,
        accountId: account.accountId,
        path: INBOX,
        mailboxId: await targetOf(account),
        known,
        counts,
        previous,
        save: (state) => store.update(account.id, { state, counts }),
      });
      await store.update(account.id, { state, counts });
      return null;
    } finally {
      await source.close();
    }
  };

  const run = async (id: string): Promise<void> => {
    const account = await store.get(id);
    if (account?.status !== "active") return;
    await store.update(id, { status: "running", lastError: null });
    try {
      const failed = await fetchOne(account);
      await store.update(id, {
        status: failed ? "login-failed" : "active",
        lastRunAt: new Date(now()),
        lastError: failed
          ? "Die Anmeldung wurde abgelehnt. Wurde das (App-)Passwort geändert? Bitte neu eintragen."
          : null,
      });
    } catch (error) {
      await store.update(id, {
        status: "active",
        lastRunAt: new Date(now()),
        lastError: (error as Error).message,
      });
    }
  };

  // One fetch at a time: a small server, and the providers' connection limits.
  let queue = Promise.resolve();
  const waiting = new Set<string>();
  const enqueue = (id: string): Promise<void> => {
    if (waiting.has(id)) return queue;
    waiting.add(id);
    queue = queue
      .then(() => run(id))
      .catch(() => undefined)
      .finally(() => waiting.delete(id));
    return queue;
  };

  /** Every 30 seconds: the accounts whose last fetch is older than two minutes. */
  const start = async () => {
    for (const account of await store.list()) {
      if (account.status === "running") await store.update(account.id, { status: "active" });
    }
    const tick = async () => {
      for (const account of await store.list()) if (isDue(account, now())) void enqueue(account.id);
    };
    void tick();
    return setInterval(() => void tick().catch(() => undefined), 30_000);
  };

  return { enqueue, start };
};

export type Fetcher = ReturnType<typeof createFetcher>;
