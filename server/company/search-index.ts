/**
 * Whether Stalwart is still building its search index, e.g. after the move to 1.0, which rebuilds
 * it (stalwart-migrate does not copy it): until then a search finds only part of the mail. Read
 * from `x:IndexQueueStatus` (crates/registry/src/schema/structs.rs, IndexQueueStatus), which lists
 * a partition only while something waits in it. Pure, the call is in routes.ts.
 */
export type IndexQueueEntry = {
  index: string;
  queuedUpdates?: number;
  queuedDeletions?: number;
  status?: { "@type": string; reason?: string };
};

export type SearchIndexStatus = { pending: number; failed: boolean };

export const searchIndexStatus = (entries: IndexQueueEntry[]): SearchIndexStatus => ({
  pending: entries.reduce(
    (sum, entry) => sum + (entry.queuedUpdates ?? 0) + (entry.queuedDeletions ?? 0),
    0,
  ),
  failed: entries.some((entry) => entry.status?.["@type"] === "Failed"),
});
