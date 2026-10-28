import type { Point, Rect, Scene, Step, Take } from "../types";

/**
 * When what happens in the film: pure functions of the storyboard, the takes and a time in
 * seconds. The stage (main.ts) only draws what these return, so a frame is the same however often
 * it is rendered.
 */

/** A take's screens come in during the first second, its steps start after it. */
export const ENTER = 0.9;
/** And they leave during the last part of the scene. */
export const EXIT = 0.6;
/** A new still fades in over this long. */
export const FADE = 0.28;
/** The camera moves to a new focus over this long. */
export const CAMERA = 1.0;

export const ease = (u: number) => {
  const x = Math.min(1, Math.max(0, u));
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};

export const easeOut = (u: number) => 1 - (1 - Math.min(1, Math.max(0, u))) ** 3;

export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

const takeSeconds = (take: Take) => take.steps.reduce((sum, step) => sum + step.seconds, 0);

export const sceneSeconds = (scene: Scene, takes: Map<string, Take>): number => {
  if (scene.kind !== "take") return scene.seconds;
  const take = takes.get(scene.take);
  if (!take) throw new Error(`No take "${scene.take}"; record it with bun run video:record.`);
  return ENTER + takeSeconds(take) + EXIT;
};

export type Slot = { scene: Scene; start: number; end: number };

export const schedule = (scenes: Scene[], takes: Map<string, Take>): Slot[] => {
  let start = 0;
  return scenes.map((scene) => {
    const end = start + sceneSeconds(scene, takes);
    const slot = { scene, start, end };
    start = end;
    return slot;
  });
};

export const slotAt = (slots: Slot[], t: number): Slot =>
  slots.find((slot) => t < slot.end) ?? slots[slots.length - 1]!;

/** How far the pointer travels per second; short ways take a minimum, long ones a maximum. */
const pointerTravel = (from: Point | undefined, to: Point) => {
  if (!from) return 0.45;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  return Math.min(0.8, Math.max(0.4, distance / 1500));
};

/** A step on the take's clock: when it starts, when its still changes, when it ends. */
export type Timed = Step & { index: number; start: number; change: number; end: number };

/**
 * The pointer moves to its target, clicks, and a moment later the still changes. `stagePoint`
 * puts a step's pointer in stage pixels, so the way between two screens is measured right.
 */
export const timeSteps = (take: Take, stagePoint: (step: Step) => Point | undefined): Timed[] => {
  let start = ENTER;
  let last: Point | undefined;
  return take.steps.map((step, index) => {
    const target = stagePoint(step);
    const travel = target ? pointerTravel(last, target) + 0.12 : 0;
    if (target) last = target;
    const timed = { ...step, index, start, change: start + travel, end: start + step.seconds };
    start = timed.end;
    return timed;
  });
};

/** The still a screen shows at a time, the one before it, and how far the change has come. */
export type Shown = { shot: string; previous?: string; progress: number; wipe: boolean };

export const shownOn = (steps: Timed[], screen: string, t: number): Shown | undefined => {
  const own = steps.filter((step) => step.screen === screen);
  const changed = own.filter((step) => step.change <= t);
  const current = changed[changed.length - 1] ?? own[0];
  if (!current) return undefined;
  const previous = changed.length > 1 ? changed[changed.length - 2] : undefined;
  const span = current.wipe ? 0.7 : current.cut ? 0 : FADE;
  const progress = span === 0 ? 1 : Math.min(1, Math.max(0, (t - current.change) / span));
  return {
    shot: current.shot,
    previous: progress < 1 ? previous?.shot : undefined,
    progress: current.wipe ? ease(progress) : progress,
    wipe: Boolean(current.wipe),
  };
};

/** When a screen comes in: at the scene's start, or with its first step. */
export const enterAt = (steps: Timed[], screen: string): number => {
  const first = steps.find((step) => step.screen === screen);
  return !first || first === steps[0] || first.start <= ENTER ? 0 : first.start - 0.5;
};

export type Pointer = { at: Point; press: number; screen: string; visible: number };

/**
 * Where the pointer is: on its way from the last click to the next, pressed for a moment at the
 * click, resting in between. Hidden before the first click and after the scene's steps.
 */
export const pointerAt = (
  steps: Timed[],
  t: number,
  stagePoint: (step: Step) => Point | undefined,
): Pointer | undefined => {
  const clicks = steps.filter((step) => step.pointer);
  const next = clicks.find((step) => t < step.change);
  const done = clicks.filter((step) => step.change <= t);
  const last = done[done.length - 1];
  const lastEnd = steps[steps.length - 1]?.end ?? 0;
  const fadeOut = 1 - Math.min(1, Math.max(0, (t - lastEnd + 0.5) / 0.4));
  if (next && t >= next.start) {
    const to = stagePoint(next)!;
    const from = last ? stagePoint(last)! : { x: to.x + 260, y: to.y + 180 };
    const travelStart = next.start;
    const travelEnd = next.change - 0.12;
    const u = ease((t - travelStart) / Math.max(0.01, travelEnd - travelStart));
    const press = t > travelEnd ? (t - travelEnd) / 0.12 : 0;
    const visible = last ? 1 : Math.min(1, (t - travelStart) / 0.25);
    return {
      at: { x: lerp(from.x, to.x, u), y: lerp(from.y, to.y, u) },
      press: Math.sin(Math.min(1, press) * Math.PI),
      screen: next.screen,
      visible,
    };
  }
  if (!last) return undefined;
  return { at: stagePoint(last)!, press: 0, screen: last.screen, visible: fadeOut };
};

/** The ripple of the last click: 0 at the click, 1 when it has faded. */
export const rippleAt = (steps: Timed[], t: number) => {
  const done = steps.filter((step) => step.pointer && step.change - 0.06 <= t);
  const last = done[done.length - 1];
  if (!last) return undefined;
  const u = (t - (last.change - 0.06)) / 0.55;
  return u < 1 ? { step: last, progress: u } : undefined;
};

export type Camera = { x: number; y: number; zoom: number };

export const WIDE: Camera = { x: 960, y: 540, zoom: 1 };

/** Looking at a rect: centred on it, as close as fits, never further than 1.9 times. */
export const cameraFor = (rect: Rect | null): Camera => {
  if (!rect) return WIDE;
  const zoom = Math.min(1.9, Math.max(1, Math.min(1500 / rect.width, 820 / rect.height)));
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, zoom };
};

/**
 * The camera at a time: it moves to a step's focus when the step's still changes and holds it
 * until a later step sets another one. `stageRect` puts a focus in stage pixels.
 */
export const cameraAt = (
  steps: Timed[],
  t: number,
  stageRect: (step: Step) => Rect | null,
): Camera => {
  const moves = steps.filter((step) => step.focus !== undefined);
  let camera = WIDE;
  for (const move of moves) {
    if (move.change > t) break;
    const target = cameraFor(stageRect(move));
    const u = ease((t - move.change) / CAMERA);
    camera = {
      x: lerp(camera.x, target.x, u),
      y: lerp(camera.y, target.y, u),
      zoom: lerp(camera.zoom, target.zoom, u),
    };
  }
  // Back to the whole picture before the scene ends.
  const lastEnd = steps[steps.length - 1]?.end ?? 0;
  const back = ease((t - lastEnd + 0.2) / (CAMERA * 0.8));
  return {
    x: lerp(camera.x, WIDE.x, back),
    y: lerp(camera.y, WIDE.y, back),
    zoom: lerp(camera.zoom, WIDE.zoom, back),
  };
};

/** The note under the picture and how visible it is (fading in and out with its steps). */
export const noteAt = (
  steps: Timed[],
  t: number,
): { text: string; opacity: number } | undefined => {
  const index = steps.findIndex((step) => step.start <= t && t < step.end);
  const step = steps[index];
  if (!step?.note) return undefined;
  let first = index;
  while (first > 0 && steps[first - 1]!.note === step.note) first -= 1;
  let last = index;
  while (last < steps.length - 1 && steps[last + 1]!.note === step.note) last += 1;
  const from = steps[first]!.change;
  const to = steps[last]!.end;
  const opacity = Math.min(1, Math.max(0, (t - from) / 0.3), Math.max(0, (to - t) / 0.3));
  return { text: step.note, opacity };
};
