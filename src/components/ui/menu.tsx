import * as Menu from "@radix-ui/react-dropdown-menu";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

export const MenuRoot = Menu.Root;
export const MenuTrigger = Menu.Trigger;

export const MenuContent = ({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.Content>) => (
  <Menu.Portal>
    <Menu.Content
      sideOffset={6}
      align="end"
      className={cn(
        "z-50 max-h-[70dvh] min-w-52 overflow-y-auto rounded-xl border border-border bg-bg p-1 text-[14px] shadow-lg",
        className,
      )}
      {...props}
    >
      {children}
    </Menu.Content>
  </Menu.Portal>
);

export const MenuItem = ({ className, ...props }: ComponentProps<typeof Menu.Item>) => (
  <Menu.Item
    className={cn(
      "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 outline-none data-[highlighted]:bg-hover data-[disabled]:opacity-50",
      className,
    )}
    {...props}
  />
);

export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <Menu.Label className="px-2.5 pt-2 pb-1 text-[12px] font-medium text-muted">
    {children}
  </Menu.Label>
);

export const MenuSeparator = () => <Menu.Separator className="my-1 h-px bg-border" />;
