import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** Where focus goes on closing; by default back to what opened the dialog. */
  onCloseAutoFocus?: (event: Event) => void;
};

/** Escape in a field with an open suggestion list closes the list, not the dialog around it. */
const keepOpenForList = (event: KeyboardEvent) => {
  const target = event.target;
  if (target instanceof HTMLElement && target.closest('[role="combobox"][aria-expanded="true"]'))
    event.preventDefault();
};

/** A centered dialog on desktop, a bottom sheet on phones that stays above the keyboard. */
export const Dialog = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  onCloseAutoFocus,
}: DialogProps) => {
  // What had the focus when the dialog opened. Radix returns the focus there itself, but many
  // dialogs here open from the URL (?event=new): they mount open, and Radix then finds nothing to
  // return to, so the keyboard's place was lost to the page's top. A layout effect runs before
  // Radix moves the focus into the dialog (its FocusScope does so in an effect).
  const opener = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (open && document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
  }, [open]);
  const returnFocus = (event: Event) => {
    onCloseAutoFocus?.(event);
    if (event.defaultPrevented || !opener.current?.isConnected) return;
    event.preventDefault();
    opener.current.focus();
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30" />
        <DialogPrimitive.Content
          className={cn(
            "fixed z-50 flex max-h-[min(92dvh,calc(var(--app-height,100dvh)-var(--safe-top)-8px))] flex-col gap-4 overflow-y-auto border border-border bg-bg p-5 shadow-xl outline-none",
            // Above the keyboard on a phone: fixed sits on the page, which iOS doesn't shorten.
            "inset-x-0 bottom-[var(--keyboard-height,0px)] rounded-t-2xl safe-bottom",
            // Centered in what one sees: a keyboard over the page (tablet) covers its lower part.
            "md:inset-auto md:top-[calc(var(--app-height,100dvh)/2)] md:left-1/2 md:w-[min(520px,calc(100vw-32px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
            className,
          )}
          aria-describedby={description ? undefined : undefined}
          onCloseAutoFocus={returnFocus}
          onEscapeKeyDown={keepOpenForList}
        >
          <div className="flex items-start gap-3">
            <div className="flex flex-1 flex-col gap-1">
              <DialogPrimitive.Title className="m-0 text-[17px] font-semibold">
                {title}
              </DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="m-0 text-[13px] text-muted">
                  {description}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">
                  {title}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close
              aria-label={m.common_close()}
              className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg"
            >
              <X size={16} />
            </DialogPrimitive.Close>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};
