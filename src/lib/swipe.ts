/**
 * Swiping a mail in the list on the phone, as Apple Mail and Gmail do it: a finger moving
 * sideways (more than up or down) drags the line; let go beyond a third of its width, it does
 * what that direction is set to. Pure.
 */

export type SwipeAction = "archive" | "delete" | "read" | "flag" | "none";
export type SwipeDirection = "left" | "right";
export type SwipeSettings = Record<SwipeDirection, SwipeAction>;

/** Right to toggle read, left to archive: what most people expect from Gmail and Apple Mail. */
export const DEFAULT_SWIPES: SwipeSettings = { left: "archive", right: "read" };

export const SWIPE_ACTIONS: SwipeAction[] = ["archive", "delete", "read", "flag", "none"];

/** A finger that moved this far decides whether it swipes or scrolls. */
export const DECIDE_PX = 12;
/** Let go beyond this share of the line's width, the action runs. */
export const DO_SHARE = 0.33;

/** Whether a movement is a swipe: sideways, and clearly more than up or down. */
export const isSwipe = (dx: number, dy: number): boolean =>
  Math.abs(dx) >= DECIDE_PX && Math.abs(dx) > Math.abs(dy) * 1.5;

export const directionOf = (dx: number): SwipeDirection => (dx < 0 ? "left" : "right");

/**
 * What letting go does: the direction's action once the line moved far enough, else nothing.
 * A direction set to "none" does not move at all (see `offsetFor`).
 */
export const actionOnRelease = (
  dx: number,
  width: number,
  settings: SwipeSettings,
): SwipeAction => {
  const action = settings[directionOf(dx)];
  return width > 0 && Math.abs(dx) >= width * DO_SHARE ? action : "none";
};

/** How far the line follows the finger: not at all towards a direction without an action. */
export const offsetFor = (dx: number, settings: SwipeSettings): number =>
  settings[directionOf(dx)] === "none" ? 0 : dx;

/** Settings as stored on the device; unknown values fall back to the defaults. */
export const readSwipeSettings = (stored: string | null): SwipeSettings => {
  try {
    const value = JSON.parse(stored ?? "{}") as Partial<SwipeSettings>;
    const pick = (direction: SwipeDirection) =>
      SWIPE_ACTIONS.includes(value[direction] as SwipeAction)
        ? (value[direction] as SwipeAction)
        : DEFAULT_SWIPES[direction];
    return { left: pick("left"), right: pick("right") };
  } catch {
    return DEFAULT_SWIPES;
  }
};
