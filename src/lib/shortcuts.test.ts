import { describe, expect, it } from "vitest";
import { isTyping, SHORTCUTS, shortcutKey } from "./shortcuts";

describe("shortcuts", () => {
  it("ignores keys while typing", () => {
    expect(isTyping(document.createElement("input"))).toBe(true);
    expect(isTyping(document.createElement("textarea"))).toBe(true);
    const editor = document.createElement("div");
    editor.setAttribute("contenteditable", "true");
    const inside = document.createElement("p");
    editor.append(inside);
    expect(isTyping(inside)).toBe(true);
    expect(isTyping(document.createElement("button"))).toBe(false);
    expect(isTyping(null)).toBe(false);
  });
  it("leaves Ctrl, Alt and Cmd to the browser", () => {
    const base = { ctrlKey: false, metaKey: false, altKey: false };
    expect(shortcutKey({ ...base, key: "j" })).toBe("j");
    expect(shortcutKey({ ...base, key: "U" })).toBe("U");
    expect(shortcutKey({ ...base, key: "c", ctrlKey: true })).toBeNull();
    expect(shortcutKey({ ...base, key: "r", metaKey: true })).toBeNull();
    expect(shortcutKey({ ...base, key: "Escape" })).toBe("esc");
    expect(shortcutKey({ ...base, key: "ArrowLeft" })).toBe("left");
  });
  it("has no key twice in one group", () => {
    for (const group of ["general", "mail", "calendar", "contacts"]) {
      const keys = SHORTCUTS.filter((s) => s.group === group).flatMap((s) => s.keys);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
