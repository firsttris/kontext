/**
 * Whether to offer notifications in a card above the mail list, instead of leaving them to the
 * switch in the bell and the settings. Asked once; after "Später" once more a week later, then not
 * again. The browser's own prompt comes only from the card's button: Safari and Firefox show it
 * only after a tap, and a site refused there cannot ask again.
 */

/** "push" offers the switch; "install" tells iPhone and iPad to add Kontext to the home screen. */
export type OfferKind = "push" | "install";

/** How often "Später" was chosen on this device, and when last. */
export type Postponed = { times: number; at: number };

export const ASK_AGAIN_AFTER = 7 * 86_400_000;

export const parsePostponed = (raw: string | null): Postponed => {
  try {
    const value = JSON.parse(raw ?? "") as Partial<Postponed>;
    return { times: Number(value.times) || 0, at: Number(value.at) || 0 };
  } catch {
    return { times: 0, at: 0 };
  }
};

/** Not yet postponed, or postponed once and a week ago. */
export const offerDue = ({ times, at }: Postponed, now: number): boolean =>
  times === 0 || (times === 1 && now - at >= ASK_AGAIN_AFTER);

/** The second time is the last: its "Später" means "not again". */
export const lastOffer = ({ times }: Postponed): boolean => times >= 1;

type Device = {
  /** The switch was set on this device, on or off: the person has decided. */
  chosen: boolean;
  supported: boolean;
  apple: boolean;
  installed: boolean;
};

/**
 * Which card this device gets, if any. Safari on iPhone and iPad has notifications only in the
 * installed app, so there the card asks for that first.
 */
export const offerKind = ({ chosen, supported, apple, installed }: Device): OfferKind | null => {
  if (chosen) return null;
  if (supported) return "push";
  return apple && !installed ? "install" : null;
};
