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

/** Saves every open composer's mail as its draft; a failed save does not stop the others. */
export const flushDrafts = async (): Promise<void> => {
  await Promise.allSettled([...flushes].map((flush) => flush()));
};
