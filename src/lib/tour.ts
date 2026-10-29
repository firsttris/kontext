/**
 * The short tour on the first start: which steps a screen gets, where each one points, stepping
 * through them, and where its card goes beside what it points at. Pure; the dialog around it is
 * features/tour/tour.tsx.
 */

export type TourScreen = "desktop" | "phone";

export type TourStepId = "welcome" | "mail" | "compose" | "shared" | "calendar" | "chat";

/**
 * One step. `targets`: the `data-tour` names of what it points at, the first one shown on the
 * page wins; none shown (or none named) puts the card in the middle of the screen.
 */
export type TourStep = { id: TourStepId; targets: readonly string[] };

/** The `data-tour` name of an app's place in the rail and in the tab bar. */
export const appTarget = (to: string) => `app:${to}`;

/** "Mehr" in the tab bar: where Chat sits on a phone that has not put it into the bar. */
export const MORE_TARGET = "app:more";

/** The steps that point into the mail sidebar, or into the phone's header of the mail list. */
const MAIL_PLACES: readonly TourStepId[] = ["compose", "shared"];

/**
 * The steps for a screen: the rail on a desktop, the tab bar on a phone (with "Mehr" when an app
 * is not in it). The step on shared mailboxes only for whoever has one, like info@. `sidebar`:
 * whether a desktop shows the mail sidebar; between md and lg it does not (mail-layout.tsx), and
 * the phone's header with its compose button is gone too, so "Neue E-Mail" and the shared
 * mailboxes would have nothing to point at.
 */
export const tourSteps = (
  screen: TourScreen,
  { shared, sidebar = true }: { shared: boolean; sidebar?: boolean },
): TourStep[] => {
  const app = (to: string) => (screen === "phone" ? [appTarget(to), MORE_TARGET] : [appTarget(to)]);
  const steps: TourStep[] = [
    { id: "welcome", targets: [] },
    { id: "mail", targets: app("/mail") },
    { id: "compose", targets: ["compose"] },
    { id: "shared", targets: ["shared"] },
    { id: "calendar", targets: app("/calendar") },
    { id: "chat", targets: app("/chat") },
  ];
  const shown = (step: TourStep) =>
    (shared || step.id !== "shared") &&
    (screen === "phone" || sidebar || !MAIL_PLACES.includes(step.id));
  return steps.filter(shown);
};

/** Where the tour stands: the step shown, of how many. */
export type TourState = { step: number; count: number };

export const tourStart = (count: number): TourState => ({ step: 0, count });

/** The next step, or null after the last one: the tour is done. */
export const tourNext = (state: TourState): TourState | null =>
  state.step + 1 < state.count ? { ...state, step: state.step + 1 } : null;

/** The step before; the first one stays. */
export const tourBack = (state: TourState): TourState => ({
  ...state,
  step: Math.max(0, state.step - 1),
});

export const isLastStep = (state: TourState) => state.step === state.count - 1;

export type Box = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };

/** Space kept between the card and what it points at, and to the screen's edges. */
const GAP = 12;
const EDGE = 8;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

/**
 * Where the card goes: right of the target (the rail), else below it (a button at the top), else
 * above it (the tab bar), else left of it, wherever it fits whole; kept on the screen. Null: in
 * the middle, for a step without a target or a card bigger than the space around it.
 */
export const cardPosition = (
  target: Box | null,
  viewport: Size,
  card: Size,
): { top: number; left: number } | null => {
  if (!target) return null;
  const alongY = clamp(target.top, EDGE, viewport.height - card.height - EDGE);
  const alongX = clamp(target.left, EDGE, viewport.width - card.width - EDGE);
  const right = target.left + target.width + GAP;
  const below = target.top + target.height + GAP;
  const above = target.top - GAP - card.height;
  const left = target.left - GAP - card.width;
  if (right + card.width <= viewport.width - EDGE) return { top: alongY, left: right };
  if (below + card.height <= viewport.height - EDGE) return { top: below, left: alongX };
  if (above >= EDGE) return { top: above, left: alongX };
  if (left >= EDGE) return { top: alongY, left };
  return null;
};
