import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Locator, Page } from "@playwright/test";
import type { Point, Rect, Screen, ScreenKind, Step, Take } from "./types";

/**
 * Recording a take: the real app is driven step by step, and after each step a sharp still is
 * taken, with where the pointer clicked and what the camera should look at. The stage
 * (video/stage/) animates between the stills; nothing is filmed in real time, so the film is the
 * same on a slow machine.
 */

export const TAKES_DIR = ".dev/video/takes";

export type ScreenOf = { page: Page; kind: ScreenKind; label: string };

/** What the camera looks at: an element (with some room around it), a rect, or everything. */
export type Focus = Locator | Rect | null;

export type StepOptions = {
  focus?: Focus;
  /** Room around a focused element, in CSS pixels. */
  pad?: number;
  note?: string;
  wipe?: boolean;
  /** The still changes at once instead of fading (typing). */
  cut?: boolean;
  /** Another browser shown in this screen, as the dark design of the same window. */
  from?: Page;
};

const isLocator = (focus: Focus): focus is Locator =>
  focus !== null && typeof (focus as Locator).boundingBox === "function";

const boxOf = async (locator: Locator): Promise<Rect> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`Not on screen: ${locator}`);
  return box;
};

const centreOf = (rect: Rect): Point => ({
  x: Math.round(rect.x + rect.width / 2),
  y: Math.round(rect.y + rect.height / 2),
});

const padded = (rect: Rect, pad: number): Rect => ({
  x: rect.x - pad,
  y: rect.y - pad,
  width: rect.width + 2 * pad,
  height: rect.height + 2 * pad,
});

const resolveFocus = async (focus: Focus | undefined, pad = 24) => {
  if (focus === undefined || focus === null) return focus;
  return isLocator(focus) ? padded(await boxOf(focus), pad) : focus;
};

export const startTake = async <Id extends string>(name: string, screens: Record<Id, ScreenOf>) => {
  const dir = join(TAKES_DIR, name);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const steps: Step[] = [];
  let count = 0;

  const snap = async (id: Id, from?: Page) => {
    const { kind } = screens[id];
    const page = from ?? screens[id].page;
    // Away with the real pointer, so no row shows its hover state; the stage draws its own.
    if (kind === "desktop") {
      const size = page.viewportSize();
      if (size) await page.mouse.move(size.width - 2, size.height - 2);
    }
    const shot = `${String(count++).padStart(3, "0")}.jpg`;
    await page.screenshot({
      path: join(dir, shot),
      type: "jpeg",
      quality: 93,
      animations: "disabled",
    });
    return shot;
  };

  const push = async (id: Id, seconds: number, options: StepOptions & { pointer?: Point }) => {
    const focus = await resolveFocus(options.focus, options.pad);
    const step: Step = { screen: id, shot: await snap(id, options.from), seconds };
    if (options.pointer) step.pointer = options.pointer;
    if (options.cut) step.cut = true;
    if (options.wipe) step.wipe = true;
    if (focus !== undefined) step.focus = focus;
    if (options.note) step.note = options.note;
    steps.push(step);
  };

  return {
    /** The screen as it is now, for `seconds`. */
    hold: (id: Id, seconds: number, options: StepOptions = {}) => push(id, seconds, options),

    /**
     * The pointer goes to the element and clicks it; `until` waits for what the click brings
     * (a dialog, a page) before the still is taken.
     */
    click: async (
      id: Id,
      target: Locator,
      seconds: number,
      options: StepOptions & { until?: () => Promise<unknown> } = {},
    ) => {
      const pointer = centreOf(await boxOf(target));
      await target.click();
      await (options.until?.() ?? screens[id].page.waitForTimeout(350));
      await push(id, seconds, { ...options, pointer });
    },

    /** Drag and drop: the pointer takes the element and lets it go over the target. */
    drag: async (
      id: Id,
      source: Locator,
      target: Locator,
      seconds: number,
      options: StepOptions = {},
    ) => {
      await push(id, 0.5, { pointer: centreOf(await boxOf(source)) });
      const pointer = centreOf(await boxOf(target));
      await source.dragTo(target);
      await screens[id].page.waitForTimeout(400);
      await push(id, seconds, { ...options, pointer });
    },

    /** Something happens without a click (a call comes in, a message arrives). */
    after: async (
      id: Id,
      action: () => Promise<unknown>,
      seconds: number,
      options: StepOptions = {},
    ) => {
      await action();
      await push(id, seconds, options);
    },

    /** Typing, a still every few letters. */
    type: async (id: Id, field: Locator, text: string, options: StepOptions = {}) => {
      const chunk = 3;
      for (let at = 0; at < text.length; at += chunk) {
        const part = text.slice(at, at + chunk);
        await field.pressSequentially(part);
        const last = at + chunk >= text.length;
        await push(id, last ? 0.45 : part.length * 0.038, { ...options, cut: true });
      }
    },

    save: async () => {
      const take: Take = {
        name,
        screens: await Promise.all(
          (Object.entries(screens) as [Id, ScreenOf][]).map(([id, { page, kind, label }]) => {
            const size = page.viewportSize()!;
            const screen: Screen = { id, kind, label, width: size.width, height: size.height };
            return screen;
          }),
        ),
        steps,
      };
      await writeFile(join(dir, "take.json"), JSON.stringify(take, null, 2));
    },
  };
};
