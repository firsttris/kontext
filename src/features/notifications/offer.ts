/**
 * Which card to show above the mail list: on a phone, to install Kontext as an app; then, to switch
 * on notifications. At most one at a time, installing first. Each is asked once; after "Später"
 * once more a week later, then not again. Browser prompts come only from a card's button: Safari
 * and Firefox show the notification prompt only after a tap, and a site refused there cannot ask
 * again.
 */

/** "install" asks to add Kontext to the home screen, "push" offers the notifications switch. */
export type OfferKind = "install" | "push";

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

export type Device = {
  /** The notifications switch was set on this device, on or off: the person has decided. */
  chosen: boolean;
  /** The browser can show notifications (Safari on iPhone and iPad only in the installed app). */
  supported: boolean;
  installed: boolean;
  /** iPhone or iPad: installed through Safari's share menu, which the card explains. */
  apple: boolean;
  /** The browser offers its install dialog (Chromium on Android); on a phone-sized screen. */
  promptOnPhone: boolean;
};

/** The cards this device could get, in order. Computers install from the settings only. */
export const offerCandidates = (device: Device): OfferKind[] => [
  ...(!device.installed && (device.apple || device.promptOnPhone) ? (["install"] as const) : []),
  ...(!device.chosen && device.supported ? (["push"] as const) : []),
];

/** The first card that is due, if any. */
export const pickOffer = (
  candidates: OfferKind[],
  postponed: Record<OfferKind, Postponed>,
  now: number,
): OfferKind | null => candidates.find((kind) => offerDue(postponed[kind], now)) ?? null;
