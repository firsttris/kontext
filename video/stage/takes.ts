import type { Scene, Screen, Step, Take } from "../types";
import { BAR, type Placement, place, rectToStage, toStage } from "./layout";
import {
  cameraAt,
  EXIT,
  easeOut,
  enterAt,
  noteAt,
  pointerAt,
  rippleAt,
  shownOn,
  timeSteps,
} from "./timeline";
import { fadeOut, showWords, wordsOf } from "./words";

/** A scene of the app: its screens in frames, the pointer, the camera, the title and the notes. */

const element = (tag: string, className: string, parent: HTMLElement) => {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
};

const POINTER = `<svg viewBox="0 0 30 30"><path d="M4 3 L4 24 L9.5 18.6 L13.4 27 L17 25.4 L13.2 17.2 L21 17.2 Z" fill="#09090b" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg>`;
const LOCK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`;

type Built = {
  screen: Screen;
  placement: Placement;
  root: HTMLElement;
  previous: HTMLImageElement;
  current: HTMLImageElement;
};

/** The frame around a screen's stills: a browser window, a phone or a card with a title. */
const buildScreen = (screen: Screen, placement: Placement, parent: HTMLElement): Built => {
  const width = screen.width * placement.scale;
  const height = screen.height * placement.scale;
  const root = element("div", `screen ${screen.kind}`, parent);
  const frame = element("div", "frame", root);
  const content = element("div", "content", frame);
  if (screen.kind === "phone") {
    const bezel = 12;
    const status = 40;
    Object.assign(frame.style, {
      left: `${placement.x - bezel}px`,
      top: `${placement.y - status - bezel}px`,
      width: `${width + 2 * bezel}px`,
      height: `${height + status + 2 * bezel}px`,
    });
    const bar = element("div", "statusbar", frame);
    Object.assign(bar.style, {
      left: `${bezel}px`,
      top: `${bezel}px`,
      width: `${width}px`,
      height: `${status}px`,
    });
    bar.innerHTML = `<span>9:41</span><span class="signal"><i></i></span>`;
    element("div", "island", frame);
    Object.assign(content.style, {
      left: `${bezel}px`,
      top: `${bezel + status}px`,
      width: `${width}px`,
      height: `${height}px`,
      borderRadius: "0 0 46px 46px",
    });
  } else {
    Object.assign(frame.style, {
      left: `${placement.x}px`,
      top: `${placement.y - BAR}px`,
      width: `${width}px`,
      height: `${height + BAR}px`,
    });
    const bar = element("div", "bar", frame);
    if (screen.kind === "desktop") {
      for (let index = 0; index < 3; index += 1) element("i", "dot", bar);
      const address = element("div", "address", bar);
      address.innerHTML = `${LOCK}<span>${screen.label}</span>`;
    } else {
      bar.textContent = screen.label;
    }
    Object.assign(content.style, {
      left: "0",
      top: `${BAR}px`,
      width: `${width}px`,
      height: `${height}px`,
    });
  }
  const previous = element("img", "", content) as HTMLImageElement;
  const current = element("img", "", content) as HTMLImageElement;
  return { screen, placement, root, previous, current };
};

/** Sets a picture's source and waits until it can be drawn, so no frame shows it half loaded. */
const load = async (image: HTMLImageElement, src: string | undefined) => {
  if (!src) {
    image.style.visibility = "hidden";
    return;
  }
  image.style.visibility = "visible";
  if (image.getAttribute("src") === src) return;
  image.src = src;
  await image.decode();
};

export const buildTake = (
  scene: Extract<Scene, { kind: "take" }>,
  take: Take,
  root: HTMLElement,
): ((t: number) => Promise<void>) => {
  const placements = place(scene.layout, take.screens);
  const placementOf = (id: string) => {
    const placement = placements.get(id);
    if (!placement) throw new Error(`Screen "${id}" has no place in layout "${scene.layout}".`);
    return placement;
  };
  const stagePoint = (step: Step) =>
    step.pointer ? toStage(placementOf(step.screen), step.pointer) : undefined;
  const stageRect = (step: Step) =>
    step.focus ? rectToStage(placementOf(step.screen), step.focus) : null;
  const steps = timeSteps(take, stagePoint);
  const end = steps[steps.length - 1]!.end + EXIT;

  const header = element("div", "header", root);
  const kicker = wordsOf(element("div", "kicker", header), scene.kicker);
  const title = wordsOf(element("h1", "", header), scene.title);
  const camera = element("div", "camera", root);
  const screens = take.screens.map((screen) => buildScreen(screen, placementOf(screen.id), camera));
  const ripple = element("div", "ripple", camera);
  const finger = element("div", "finger", camera);
  const pointer = element("div", "pointer", camera);
  pointer.innerHTML = POINTER;
  const note = element("div", "note", root);
  const noteText = element("span", "", note);

  return async (t) => {
    showWords(kicker, t, 0, 0.04);
    showWords(title, t, 0.15);
    const view = cameraAt(steps, t, stageRect);
    camera.style.transform = `translate(${960 - view.x * view.zoom}px, ${540 - view.y * view.zoom}px) scale(${view.zoom})`;
    // The title gives way as soon as the camera leaves the whole picture.
    const away = Math.max(
      (view.zoom - 1) * 4,
      Math.abs(view.y - 540) / 60,
      Math.abs(view.x - 960) / 60,
    );
    header.style.opacity = String(fadeOut(t, end, 0.6) * Math.max(0, 1 - away));
    const leaving = fadeOut(t, end, 0.6);
    await Promise.all(
      screens.map(async ({ screen, root: box, previous, current }) => {
        const entering = easeOut((t - enterAt(steps, screen.id) - 0.25) / 0.9);
        box.style.opacity = String(entering * leaving);
        box.style.transform = `perspective(1800px) translateY(${(1 - entering) * 90 - (1 - leaving) * 50}px) rotateX(${(1 - entering) * 16}deg)`;
        const shown = shownOn(steps, screen.id, t);
        await Promise.all([
          load(previous, shown?.previous && `takes/${take.name}/${shown.previous}`),
          load(current, shown && `takes/${take.name}/${shown.shot}`),
        ]);
        if (!shown) return;
        current.style.opacity = shown.wipe || !shown.previous ? "1" : String(shown.progress);
        current.style.clipPath =
          shown.wipe && shown.previous ? `inset(0 ${(1 - shown.progress) * 100}% 0 0)` : "none";
      }),
    );

    const hand = pointerAt(steps, t, stagePoint);
    const onPhone = hand && kindOf(take, hand.screen) === "phone";
    pointer.style.opacity = String(hand && !onPhone ? hand.visible * leaving : 0);
    finger.style.opacity = String(hand && onPhone ? hand.visible * (0.35 + 0.65 * hand.press) : 0);
    if (hand) {
      pointer.style.transform = `translate(${hand.at.x - 4}px, ${hand.at.y - 3}px) scale(${1 - 0.18 * hand.press})`;
      finger.style.transform = `translate(${hand.at.x}px, ${hand.at.y}px) scale(${1 - 0.2 * hand.press})`;
    }
    const wave = rippleAt(steps, t);
    ripple.style.opacity = String(wave ? (1 - wave.progress) * 0.9 : 0);
    if (wave) {
      const at = stagePoint(wave.step)!;
      ripple.style.transform = `translate(${at.x}px, ${at.y}px) scale(${0.3 + easeOut(wave.progress) * 1.1})`;
    }

    const line = noteAt(steps, t);
    note.style.opacity = String(line?.opacity ?? 0);
    if (line) {
      noteText.textContent = line.text;
      const pop = easeOut(line.opacity);
      note.style.transform = `translateX(-50%) translateY(${(1 - pop) * 24}px) scale(${0.94 + 0.06 * pop})`;
    }
  };
};

const kindOf = (take: Take, id: string) => take.screens.find((screen) => screen.id === id)?.kind;
