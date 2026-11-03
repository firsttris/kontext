import { afterEach, describe, expect, it } from "vitest";
import { printPage } from "./print-frame";

const button = (name: string) => {
  const element = document.createElement("button");
  element.textContent = name;
  document.body.append(element);
  return element;
};

afterEach(() => document.body.replaceChildren());

describe("printPage", () => {
  it("gives the focus back to where one was when printing started", async () => {
    const before = button("Weitere Aktionen");
    before.focus();
    await printPage("<p>Mail</p>");
    expect(document.activeElement).toBe(before);
  });

  it("leaves the focus where one moved it while the page was loading", async () => {
    const first = button("Weitere Aktionen");
    const next = button("Antworten");
    first.focus();
    const printing = printPage("<p>Mail</p>");
    // The frame and its pictures take a while (up to IMAGE_WAIT_MS); meanwhile one goes on.
    next.focus();
    await printing;
    expect(document.activeElement).toBe(next);
  });
});
