import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
};

/** A centered dialog on desktop, a bottom sheet on phones. */
export const Dialog = ({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
}: DialogProps) => (
  <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/30" />
      <DialogPrimitive.Content
        className={cn(
          "fixed z-50 flex max-h-[92dvh] flex-col gap-4 overflow-y-auto border border-border bg-bg p-5 shadow-xl outline-none",
          "inset-x-0 bottom-0 rounded-t-2xl safe-bottom",
          "md:inset-auto md:top-1/2 md:left-1/2 md:w-[min(520px,calc(100vw-32px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
          className,
        )}
        aria-describedby={description ? undefined : undefined}
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
              <DialogPrimitive.Description className="sr-only">{title}</DialogPrimitive.Description>
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
