/** Registers single-key shortcuts while the component is shown (see src/lib/shortcuts.ts). */
import { useEffect, useRef } from "react";
import { isTyping, shortcutKey } from "@/lib/shortcuts";

export const useShortcuts = (handlers: Record<string, (() => void) | undefined>): void => {
  const latest = useRef(handlers);
  latest.current = handlers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = shortcutKey(event);
      if (!key || event.defaultPrevented || isTyping(event.target)) return;
      // An open dialog has the keyboard; Escape there closes the dialog.
      if (document.querySelector('[role="dialog"]')) return;
      const handler = latest.current[key];
      if (!handler) return;
      event.preventDefault();
      handler();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
};
