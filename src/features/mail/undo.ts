/**
 * "Rückgängig" after archiving, deleting into the trash, marking as spam and moving: the notice
 * that follows carries it, and `z` (or Ctrl+Z / Cmd+Z outside text fields) takes back the last
 * one. Deleting for good (in Trash or Spam) and moving into another mailbox have no way back.
 */
import { useEffect } from "react";
import { useToast } from "@/components/ui/toast";
import { useShortcuts } from "@/components/use-shortcuts";
import { isTyping } from "@/lib/shortcuts";
import { createUndoSlot, type MailMove } from "@/lib/undo-move";
import { m } from "@/paraglide/messages";
import { useMailActions } from "./actions";

type Undo = () => Promise<unknown>;

/** One for the app: the notice and the shortcut may sit in different parts of the page. */
const lastUndo = createUndoSlot<Undo>();

type Toast = ReturnType<typeof useToast>;

const showError = (toast: Toast) => (error: Error) =>
  toast.show(m.common_error({ message: error.message }), "error");

/**
 * Says `text` and offers to take back the moves that were made. Without any (deleted for good,
 * copied into another mailbox) it says nothing, as before.
 */
export const useOfferUndo = () => {
  const toast = useToast();
  const { undoMove } = useMailActions();
  return (text: string, moves: (MailMove | undefined)[]) => {
    const done = moves.filter((move): move is MailMove => Boolean(move));
    if (!done.length) return;
    const undo: Undo = () => Promise.all(done.map(undoMove));
    lastUndo.set(undo);
    toast.show(text, "info", {
      duration: 8000,
      action: {
        label: m.mail_undo(),
        run: () => {
          lastUndo.drop(undo);
          void undo().catch(showError(toast));
        },
      },
    });
  };
};

const takeBackLast = (toast: Toast) => void lastUndo.take()?.().catch(showError(toast));

/** `z`, Ctrl+Z and Cmd+Z: the last move back, while the mail list is shown. */
export const useUndoShortcut = () => {
  const toast = useToast();
  useShortcuts({ z: () => takeBackLast(toast) });
  // Ctrl/Cmd+Z stays the text fields' own undo; single-key shortcuts skip modifier keys.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      if (event.key.toLowerCase() !== "z" || event.defaultPrevented || isTyping(event.target))
        return;
      if (document.querySelector('[role="dialog"]')) return;
      event.preventDefault();
      takeBackLast(toast);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toast]);
};
