/**
 * What one can do with a message. On a desktop a small bar floats over the message's top right
 * corner while the pointer is on it (react, answer in the thread, more); it takes no room, so
 * nothing moves when it shows. On a phone nothing sits next to the bubbles: a long press opens a
 * sheet with the quick reactions and the actions, as messengers do.
 */
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Copy, Ellipsis, ListChecks, MessageSquareReply, Pencil, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { QUICK_REACTIONS } from "@/lib/chat-threads";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { ReactionPicker } from "./reactions";

/** What a message offers; a missing handler means the action isn't there. */
export type MessageActions = {
  onReact?: (emoji: string) => void;
  onReply?: () => void;
  onCopy?: () => void;
  onMakeTask?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
};

const barButton =
  "flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg data-[state=open]:bg-hover data-[state=open]:text-fg";

/** The bar over a message on a desktop: shown on hover, on focus and while its menu is open. */
export const HoverBar = ({ actions }: { actions: MessageActions }) => {
  const { onReact, onReply, onMakeTask, onEdit, onDelete } = actions;
  const more = onMakeTask || onEdit || onDelete;
  if (!onReact && !onReply && !more) return null;
  return (
    <div className="absolute -top-4 right-1 z-10 hidden items-center gap-0.5 rounded-lg border border-border bg-bg p-0.5 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 md:flex">
      {onReact ? <ReactionPicker onPick={onReact} className={barButton} /> : null}
      {onReply ? (
        <button
          type="button"
          aria-label={m.chat_reply()}
          title={m.chat_reply()}
          onClick={onReply}
          className={barButton}
        >
          <MessageSquareReply size={16} />
        </button>
      ) : null}
      {more ? (
        <MenuRoot>
          <MenuTrigger
            aria-label={m.chat_message_actions()}
            title={m.chat_message_actions()}
            className={barButton}
          >
            <Ellipsis size={16} />
          </MenuTrigger>
          <MenuContent align="end">
            {onMakeTask ? (
              <MenuItem onSelect={onMakeTask}>
                <ListChecks size={15} /> {m.chat_make_task()}
              </MenuItem>
            ) : null}
            {onEdit ? (
              <MenuItem onSelect={onEdit}>
                <Pencil size={15} /> {m.chat_edit_message()}
              </MenuItem>
            ) : null}
            {onDelete ? (
              <MenuItem onSelect={onDelete} className="text-danger">
                <Trash2 size={15} /> {m.chat_delete_message()}
              </MenuItem>
            ) : null}
          </MenuContent>
        </MenuRoot>
      ) : null}
    </div>
  );
};

const SheetAction = ({
  icon,
  label,
  danger = false,
  onSelect,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onSelect: () => void;
}) => (
  <button
    type="button"
    onClick={onSelect}
    className={cn(
      "flex h-12 w-full items-center gap-3.5 rounded-xl px-3 text-left text-[16px] hover:bg-hover active:bg-hover",
      danger && "text-danger",
    )}
  >
    {icon}
    {label}
  </button>
);

/**
 * The sheet a long press opens on a phone: the quick reactions in a row, then the actions. Each
 * choice closes it first, so a dialog it opens (a task, the thread) isn't covered by it.
 */
export const ActionSheet = ({
  open,
  onOpenChange,
  actions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actions: MessageActions;
}) => {
  const choose = (action: () => void) => () => {
    onOpenChange(false);
    action();
  };
  const { onReact, onReply, onCopy, onMakeTask, onEdit, onDelete } = actions;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Focus on the sheet, not ringed on the first emoji: a finger opened it.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          className="fixed inset-x-0 bottom-[var(--keyboard-height,0px)] z-50 flex flex-col gap-2 rounded-t-2xl border border-border bg-bg px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] shadow-xl outline-none"
        >
          <span aria-hidden="true" className="mx-auto mb-1 h-1 w-10 rounded-full bg-border" />
          <DialogPrimitive.Title className="sr-only">
            {m.chat_message_actions()}
          </DialogPrimitive.Title>
          {onReact ? (
            <fieldset
              aria-label={m.chat_react()}
              className="m-0 flex min-w-0 justify-between border-0 border-b border-border px-1 pt-0 pb-3"
            >
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  aria-label={m.chat_react_with({ emoji })}
                  onClick={choose(() => onReact(emoji))}
                  className="flex size-11 items-center justify-center rounded-full bg-subtle text-[22px] active:scale-110"
                >
                  {emoji}
                </button>
              ))}
            </fieldset>
          ) : null}
          <div className="flex flex-col">
            {onReply ? (
              <SheetAction
                icon={<MessageSquareReply size={20} />}
                label={m.chat_reply_in_thread()}
                onSelect={choose(onReply)}
              />
            ) : null}
            {onCopy ? (
              <SheetAction
                icon={<Copy size={20} />}
                label={m.chat_copy_text()}
                onSelect={choose(onCopy)}
              />
            ) : null}
            {onMakeTask ? (
              <SheetAction
                icon={<ListChecks size={20} />}
                label={m.chat_make_task()}
                onSelect={choose(onMakeTask)}
              />
            ) : null}
            {onEdit ? (
              <SheetAction
                icon={<Pencil size={20} />}
                label={m.chat_edit_message()}
                onSelect={choose(onEdit)}
              />
            ) : null}
            {onDelete ? (
              <SheetAction
                icon={<Trash2 size={20} />}
                label={m.chat_delete_message()}
                danger
                onSelect={choose(onDelete)}
              />
            ) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

/** Copies a message's text, and says so: on a phone the bubble's text can't be selected. */
export const useCopyText = () => {
  const toast = useToast();
  return (text: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.show(m.chat_text_copied()))
      .catch((error: Error) => toast.show(m.common_error({ message: error.message }), "error"));
};
