/**
 * What a take (e2e/video.spec.ts) leaves for the stage (video/stage/): stills of the real app, one
 * per step, with where the pointer went and what the camera looks at. Positions are in the CSS
 * pixels of the screen they belong to.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

/** A browser window, a phone, or a plain card (the agent's chat, what the server sees). */
export type ScreenKind = "desktop" | "phone" | "panel";

export type Screen = {
  id: string;
  kind: ScreenKind;
  width: number;
  height: number;
  /** The address in the window's bar, the panel's title. */
  label: string;
};

export type Step = {
  screen: string;
  /** The still after the step, a file next to take.json. */
  shot: string;
  /** How long the step lasts, the pointer's way included. */
  seconds: number;
  /** Where the pointer clicks (or the finger taps) before the still changes. */
  pointer?: Point;
  /** Typing: the still changes at once instead of fading. */
  cut?: boolean;
  /** The new still is wiped in from the left (light to dark). */
  wipe?: boolean;
  /** What the camera looks at from this step on; null is the whole stage, absent keeps it. */
  focus?: Rect | null;
  /** A short line under the picture while the step lasts. */
  note?: string;
};

export type Take = { name: string; screens: Screen[]; steps: Step[] };

/** How the screens of a scene sit on the stage. */
export type Layout = "window" | "duo" | "panel" | "phones";

export type Scene =
  | { kind: "title"; lines: string[]; small?: string; seconds: number }
  | { kind: "chips"; title: string; chips: string[]; seconds: number }
  | { kind: "take"; take: string; layout: Layout; kicker: string; title: string }
  | { kind: "end"; title: string; claim: string; link: string; seconds: number };
