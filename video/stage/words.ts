import { easeOut } from "./timeline";

/**
 * Text that comes in word by word: each word rises, sharpens and appears a little after the one
 * before. Built once per scene; `show` sets the styles for a time.
 */
export const wordsOf = (element: HTMLElement, text: string) => {
  element.replaceChildren(
    ...text.split(/(\s+)/).map((part) => {
      const span = document.createElement("span");
      span.className = "word";
      span.textContent = part;
      return span;
    }),
  );
  return [...element.querySelectorAll<HTMLElement>(".word")];
};

export const showWords = (words: HTMLElement[], t: number, from: number, stagger = 0.06) => {
  words.forEach((word, index) => {
    const u = easeOut((t - from - index * stagger) / 0.6);
    word.style.opacity = String(u);
    word.style.transform = `translateY(${(1 - u) * 34}px)`;
    word.style.filter = `blur(${(1 - u) * 10}px)`;
  });
};

/** Fading out towards the end of a scene: 1 until `seconds` before the end, then to 0. */
export const fadeOut = (t: number, end: number, seconds = 0.5) =>
  Math.min(1, Math.max(0, (end - t) / seconds));
