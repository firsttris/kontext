import * as Menu from "@radix-ui/react-dropdown-menu";
import { Check } from "lucide-react";
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

/** An item that is on or off; it stays open, so several can be switched in a row. */
export const MenuCheckboxItem = ({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.CheckboxItem>) => (
  <Menu.CheckboxItem
    onSelect={(event) => event.preventDefault()}
    className={cn(
      "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 outline-none data-[highlighted]:bg-hover",
      className,
    )}
    {...props}
  >
    {children}
    <Menu.ItemIndicator className="ml-auto text-fg">
      <Check size={15} />
    </Menu.ItemIndicator>
  </Menu.CheckboxItem>
);

export const MenuRadioGroup = Menu.RadioGroup;

/** One of several choices; the chosen one has a check mark. */
export const MenuRadioItem = ({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.RadioItem>) => (
  <Menu.RadioItem
    className={cn(
      "flex h-9 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 outline-none data-[highlighted]:bg-hover",
      className,
    )}
    {...props}
  >
    {children}
    <Menu.ItemIndicator className="ml-auto text-fg">
      <Check size={15} />
    </Menu.ItemIndicator>
  </Menu.RadioItem>
);
