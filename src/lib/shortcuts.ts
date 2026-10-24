/**
 * Keyboard shortcuts, like in Gmail: single keys, only while no text field has the focus. The
 * list is data, so the help dialog and the settings page show the same thing the app does.
 */

/** Typing in a field (or the mail editor) never triggers a shortcut. */
export const isTyping = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest("[contenteditable=true]") !== null
  );
};

/**
 * The key a shortcut is named by ("j", "U", "#", "esc", "left"); none while Ctrl, Alt or Cmd is
 * held, those belong to the browser.
 */
export const shortcutKey = (event: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}): string | null => {
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  return NAMES[event.key] ?? event.key;
};

const NAMES: Record<string, string> = { Escape: "esc", ArrowLeft: "left", ArrowRight: "right" };

export type ShortcutGroup = "general" | "mail" | "calendar" | "contacts";

/** Every shortcut with its group; `keys` as shown in the help ("j / k"). */
export const SHORTCUTS: { group: ShortcutGroup; keys: string[]; action: string }[] = [
  { group: "general", keys: ["?"], action: "help" },
  { group: "general", keys: ["1", "2", "3"], action: "apps" },
  { group: "mail", keys: ["c"], action: "compose" },
  { group: "mail", keys: ["/"], action: "search" },
  { group: "mail", keys: ["j", "k"], action: "nextPrev" },
  { group: "mail", keys: ["r"], action: "reply" },
  { group: "mail", keys: ["a"], action: "replyAll" },
  { group: "mail", keys: ["f"], action: "forward" },
  { group: "mail", keys: ["e"], action: "archive" },
  { group: "mail", keys: ["#"], action: "delete" },
  { group: "mail", keys: ["s"], action: "flag" },
  { group: "mail", keys: ["!"], action: "spam" },
  { group: "mail", keys: ["U"], action: "unread" },
  { group: "mail", keys: ["Esc"], action: "close" },
  { group: "calendar", keys: ["c"], action: "newEvent" },
  { group: "calendar", keys: ["t"], action: "today" },
  { group: "calendar", keys: ["←", "→"], action: "prevNext" },
  { group: "calendar", keys: ["d", "w", "m", "l"], action: "views" },
  { group: "contacts", keys: ["c"], action: "newContact" },
  { group: "contacts", keys: ["/"], action: "search" },
];
