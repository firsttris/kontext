/**
 * The way back from a move (archive, trash, spam, another folder): the mails go from where they
 * went back to where they were, and each keyword the move set or removed is turned the other way
 * ($junk set → removed, $notjunk removed → set, as "Kein Spam" does).
 */
export type MailMove = {
  accountId: string;
  ids: string[];
  from: string;
  to: string;
  keywords?: Record<string, true | null>;
};

export const reverseMove = (move: MailMove): MailMove => ({
  ...move,
  from: move.to,
  to: move.from,
  keywords: move.keywords
    ? Object.fromEntries(Object.entries(move.keywords).map(([key, on]) => [key, on ? null : true]))
    : undefined,
});

/**
 * The last action that can be taken back, for `z`. A notice's "Rückgängig" takes back its own
 * action, even when a later one came since, and leaves the slot to that later one.
 */
export const createUndoSlot = <T>() => {
  let last: T | undefined;
  return {
    set: (undo: T) => {
      last = undo;
    },
    /** The last one, once. */
    take: (): T | undefined => {
      const undo = last;
      last = undefined;
      return undo;
    },
    /** Forgets `undo` if it is the last one (its notice took it back). */
    drop: (undo: T) => {
      if (last === undo) last = undefined;
    },
  };
};
