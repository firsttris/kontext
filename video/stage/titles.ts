import type { Scene } from "../types";
import { icons } from "./icons";
import { easeOut } from "./timeline";
import { fadeOut, showWords, wordsOf } from "./words";

/** The scenes without the app: the opening lines, the list of what's inside, the end. */

type Draw = (t: number) => void;

const element = (tag: string, className: string, parent: HTMLElement) => {
  const node = document.createElement(tag);
  node.className = className;
  parent.append(node);
  return node;
};

/** Opening and closing lines; a line ending in "~" is set in grey. */
export const buildTitle = (scene: Extract<Scene, { kind: "title" }>, root: HTMLElement): Draw => {
  const box = element("div", "title", root);
  const lines = scene.lines.map((line, index) => {
    const node = element("div", line.endsWith("~") ? "line dim" : "line", box);
    return { words: wordsOf(node, line.replace(/~$/, "")), from: 0.2 + index * 0.75 };
  });
  const small = scene.small
    ? wordsOf(element("div", "small", box), scene.small)
    : ([] as HTMLElement[]);
  return (t) => {
    for (const line of lines) showWords(line.words, t, line.from);
    showWords(small, t, 0.4 + lines.length * 0.75, 0.03);
    box.style.opacity = String(fadeOut(t, scene.seconds));
    box.style.transform = `scale(${1 + t * 0.008})`;
  };
};

export const buildChips = (scene: Extract<Scene, { kind: "chips" }>, root: HTMLElement): Draw => {
  const box = element("div", "title", root);
  const title = wordsOf(element("div", "line", box), scene.title);
  const row = element("div", "chips", box);
  const chips = scene.chips.map(({ icon, label }) => {
    const chip = element("div", "chip", row);
    chip.innerHTML = icons[icon] ?? "";
    chip.append(label);
    return chip;
  });
  return (t) => {
    showWords(title, t, 0.1);
    chips.forEach((chip, index) => {
      const u = easeOut((t - 0.7 - index * 0.11) / 0.5);
      chip.style.opacity = String(u);
      chip.style.transform = `translateY(${(1 - u) * 40}px) scale(${0.85 + 0.15 * u})`;
    });
    box.style.opacity = String(fadeOut(t, scene.seconds));
  };
};

export const buildEnd = (scene: Extract<Scene, { kind: "end" }>, root: HTMLElement): Draw => {
  const box = element("div", "title", root);
  const logo = element("div", "logo", box);
  logo.textContent = "K";
  const title = wordsOf(element("div", "line", box), scene.title);
  const claim = wordsOf(element("div", "small", box), scene.claim);
  const link = element("div", "link", box);
  link.textContent = scene.link;
  return (t) => {
    const u = easeOut(t / 0.8);
    logo.style.opacity = String(u);
    logo.style.transform = `scale(${0.6 + 0.4 * u}) rotate(${(1 - u) * -12}deg)`;
    showWords(title, t, 0.5);
    showWords(claim, t, 1.1, 0.04);
    const l = easeOut((t - 1.8) / 0.6);
    link.style.opacity = String(l);
    link.style.transform = `translateY(${(1 - l) * 20}px)`;
  };
};
