import type { Scene, Take } from "../types";
import { buildTake } from "./takes";
import { schedule, slotAt } from "./timeline";
import { buildChips, buildEnd, buildTitle } from "./titles";

/**
 * The stage in the browser: video/render.ts loads it, waits for `window.film`, and calls
 * `window.film.render(t)` once per frame before it takes the picture.
 */

type Draw = (t: number) => void | Promise<void>;

const film = (await (await fetch("film.json")).json()) as { scenes: Scene[]; takes: Take[] };
const takes = new Map(film.takes.map((take) => [take.name, take]));
const slots = schedule(film.scenes, takes);
const root = document.getElementById("scene")!;
const glows = [...document.querySelectorAll<HTMLElement>(".glow")];

const build = (scene: Scene, layer: HTMLElement): Draw => {
  if (scene.kind === "title") return buildTitle(scene, layer);
  if (scene.kind === "chips") return buildChips(scene, layer);
  if (scene.kind === "end") return buildEnd(scene, layer);
  return buildTake(scene, takes.get(scene.take)!, layer);
};

let shown: { index: number; draw: Draw } | undefined;

/** The light behind the stage drifts slowly. */
const drift = (t: number) => {
  const [one, two] = glows;
  one!.style.transform = `translate(${-300 + Math.sin(t * 0.15) * 260}px, ${-500 + Math.cos(t * 0.11) * 120}px)`;
  two!.style.transform = `translate(${1100 + Math.cos(t * 0.13) * 240}px, ${200 + Math.sin(t * 0.09) * 160}px)`;
};

const render = async (t: number) => {
  const slot = slotAt(slots, t);
  const index = slots.indexOf(slot);
  if (shown?.index !== index) {
    const layer = document.createElement("div");
    layer.className = "layer";
    root.replaceChildren(layer);
    shown = { index, draw: build(slot.scene, layer) };
  }
  drift(t);
  await shown.draw(t - slot.start);
};

await document.fonts.ready;
Object.assign(window, { film: { seconds: slots[slots.length - 1]!.end, render } });
