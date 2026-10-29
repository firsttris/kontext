/**
 * The open composers' last save, for a sign-out that does not wait for them (Abmelden nach
 * Inaktivität): each composer registers how it saves what is not saved yet, and the sign-out
 * runs them all first. The composer's own autosave covers the rest.
 */
type Flush = () => Promise<void>;

const flushes = new Set<Flush>();

/** Returns the unregistering, for an effect's cleanup. */
export const registerDraftFlush = (flush: Flush): (() => void) => {
  flushes.add(flush);
  return () => {
    flushes.delete(flush);
  };
};

/** How long the sign-out waits for the saves: a request that never answers must not keep it open. */
export const FLUSH_LIMIT_MS = 10_000;

/**
 * Saves every open composer's mail as its draft; a failed save does not stop the others, and
 * after FLUSH_LIMIT_MS the sign-out goes on without the saves still running.
 */
export const flushDrafts = async (): Promise<void> => {
  let limit: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    Promise.allSettled([...flushes].map((flush) => flush())),
    new Promise<void>((resolve) => {
      limit = setTimeout(resolve, FLUSH_LIMIT_MS);
    }),
  ]);
  clearTimeout(limit);
};
