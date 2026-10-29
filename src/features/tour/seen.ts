/**
 * Who has seen the tour on this device: the sign-in addresses, so two people sharing a computer
 * each get it once. Per device on purpose: the tour points at the rail on a desktop and at the tab
 * bar on a phone, so the first start on a phone deserves its own. The server has no per-person
 * settings store, and one flag is not worth a table (docs/architecture.md).
 */
import { storedSet } from "@/components/stored-set";

export const TOUR_SEEN_KEY = "kontext.tour.seen";

const seen = storedSet(TOUR_SEEN_KEY);

export const useTourSeen = seen.useSet;

export const markTourSeen = (user: string) => seen.set(user, true);

/** "Einführung" in the menu: the tour comes back as on the first start. */
export const restartTour = (user: string) => seen.set(user, false);
