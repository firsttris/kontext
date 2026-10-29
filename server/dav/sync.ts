/**
 * WebDAV `sync-collection` (RFC 6578) for the task lists, so a client asks "what changed since?"
 * instead of listing every task (the iPhone does so on each refresh).
 *
 * The sync token is the board's ctag (a hash over each listed task's id and change time) as a URI.
 * Kontext keeps no change log; instead it remembers, in memory, which tasks with which ETags a
 * board had for the last tokens it handed out (`createSnapshots`). Asked with one of them, it
 * compares that state with today's: new or changed tasks come with their ETag, gone ones (deleted,
 * or finished more than 30 days ago) as 404. A token it no longer knows (after a restart, or long
 * ago) is refused with `DAV:valid-sync-token`, and the client syncs anew from the start (RFC 6578
 * §3.2) – as it would have without sync-collection. Pure, apart from the memory.
 */

const PREFIX = "urn:kontext:sync:";
/** Tokens remembered per board; older ones make the client start anew. */
const KEPT = 50;

/** What a board holds at one moment: task file name → ETag. */
export type Snapshot = ReadonlyMap<string, string>;

export const syncToken = (ctag: string): string => `${PREFIX}${ctag}`;

/** The ctag in a token of ours; null for another server's or a malformed one. */
export const ctagOf = (token: string): string | null =>
  token.startsWith(PREFIX) && token.length > PREFIX.length ? token.slice(PREFIX.length) : null;

/** The token a sync-collection REPORT brings; "" for the first sync. */
export const tokenIn = (body: string): string =>
  body
    .match(/<(?:[\w-]+:)?sync-token\s*>([^<]*)<\/(?:[\w-]+:)?sync-token>/)?.[1]
    ?.trim()
    .replace(/&amp;/g, "&") ?? "";

/** Whether the client wants the tasks' content in the answer, not only their ETags. */
export const wantsData = (body: string): boolean => /<(?:[\w-]+:)?calendar-data\b/.test(body);

/** What changed from `before` to `now`: names new or with another ETag, and names gone. */
export const changesSince = (before: Snapshot, now: Snapshot) => ({
  changed: [...now].filter(([name, etag]) => before.get(name) !== etag).map(([name]) => name),
  removed: [...before.keys()].filter((name) => !now.has(name)),
});

/** The last tokens handed out per board, with the state each stands for. */
export const createSnapshots = (kept = KEPT) => {
  const boards = new Map<string, Map<string, Snapshot>>();
  return {
    remember: (board: string, ctag: string, snapshot: Snapshot) => {
      const tokens = boards.get(board) ?? new Map<string, Snapshot>();
      // Again at the end: the newest stays longest.
      tokens.delete(ctag);
      tokens.set(ctag, snapshot);
      for (const old of tokens.keys()) {
        if (tokens.size <= kept) break;
        tokens.delete(old);
      }
      boards.set(board, tokens);
    },
    recall: (board: string, ctag: string): Snapshot | null => boards.get(board)?.get(ctag) ?? null,
  };
};

export type Snapshots = ReturnType<typeof createSnapshots>;
