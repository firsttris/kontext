/** The frame of every logged-in page: the app rail on the left (desktop), the page beside it. */
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Ellipsis, Keyboard, LogOut, Phone, Settings } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useAuth } from "@/auth/auth";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import {
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useShortcuts } from "@/components/use-shortcuts";
import { useVisibleHeight } from "@/components/use-visible-height";
import { useChannels } from "@/features/chat/queries";
import { useFrameState } from "@/features/documents/frame-store";
import { usePhone } from "@/features/phone/queries";
import { totalUnread } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { AccountAvatar, StorageSummary, storageText, useOwnQuota } from "./account-avatar";
import { TAB_ITEMS, useMoreItems, useNavItems } from "./nav-items";
import { useSession } from "./session";

export { useSession };

const UserMenu = () => {
  const { logout } = useAuth();
  const { data: session } = useSession();
  const name = session?.username ?? "";
  const quota = useOwnQuota();
  return (
    <MenuRoot>
      <MenuTrigger
        aria-label={name}
        title={quota ? storageText(quota) : undefined}
        className="flex items-center justify-center rounded-full outline-offset-2"
      >
        <AccountAvatar name={name} size={30} />
      </MenuTrigger>
      <MenuContent side="right" align="end">
        <MenuLabel>{name}</MenuLabel>
        <StorageSummary />
        <MenuSeparator />
        <MenuItem asChild>
          <Link to="/settings" search={{}} className="text-fg no-underline">
            <Settings size={15} /> {m.nav_settings()}
          </Link>
        </MenuItem>
        <MenuItem onSelect={logout}>
          <LogOut size={15} /> {m.logout()}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
};

export const railButton = (active: boolean) =>
  cn(
    "flex size-10 items-center justify-center rounded-[10px] hover:bg-hover",
    active ? "bg-subtle text-fg" : "text-muted hover:text-fg",
  );

/** "Telefon" in the rail and under "Mehr", for whoever may telephone through the box. */
const usePhoneNav = (): boolean => {
  const { enabled, allowed } = usePhone();
  return enabled && allowed;
};

/** Unread chat messages, for the badge on "Chat". */
const useChatUnread = (): number => totalUnread(useChannels().channels);

const UnreadBadge = ({ count, className }: { count: number; className?: string }) =>
  count > 0 ? (
    <span
      className={cn(
        "absolute rounded-full bg-accent px-1 font-mono text-[10px] leading-[15px] font-medium text-white",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  ) : null;

const unreadLabel = (label: string, count: number) =>
  count > 0 ? m.nav_unread({ label, count }) : label;

/** The rail's name of an app, with what waits there. */
const railLabel = (to: string, label: string, chatUnread: number, unsavedDocuments: boolean) => {
  if (to === "/chat") return unreadLabel(label, chatUnread);
  return to === "/documents" && unsavedDocuments ? m.nav_documents_unsaved() : label;
};

const Rail = ({ onHelp, bell }: { onHelp: () => void; bell: ReactNode }) => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const chatUnread = useChatUnread();
  const phone = usePhoneNav();
  const { unsaved } = useFrameState();
  return (
    <nav
      aria-label="Apps"
      className="hidden h-full w-[60px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-side py-3.5 md:flex"
    >
      <div
        aria-hidden="true"
        className="mb-3.5 flex size-8 items-center justify-center rounded-[9px] bg-primary text-[13px] font-semibold text-onprimary"
      >
        K
      </div>
      {useNavItems().map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        const unread = to === "/chat" ? chatUnread : 0;
        return (
          <Link
            key={to}
            to={to}
            aria-label={railLabel(to, label(), chatUnread, unsaved)}
            title={label()}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex size-10 items-center justify-center rounded-[10px] hover:bg-hover",
              active ? "bg-subtle text-fg" : "text-muted",
            )}
          >
            <Icon size={18} strokeWidth={1.75} />
            <UnreadBadge count={unread} className="top-0.5 right-0.5" />
            {to === "/documents" && unsaved ? (
              <span
                aria-hidden="true"
                className="absolute top-1.5 right-1.5 size-2 rounded-full bg-accent"
              />
            ) : null}
          </Link>
        );
      })}
      {phone ? (
        <Link
          to="/phone"
          aria-label={m.nav_phone()}
          title={m.nav_phone()}
          aria-current={pathname.startsWith("/phone") ? "page" : undefined}
          className={railButton(pathname.startsWith("/phone"))}
        >
          <Phone size={18} strokeWidth={1.75} />
        </Link>
      ) : null}
      <div className="flex-1" />
      {bell}
      <button
        type="button"
        onClick={onHelp}
        aria-label={m.shortcuts_open()}
        title={m.shortcuts_open()}
        className={railButton(false)}
      >
        <Keyboard size={18} strokeWidth={1.75} />
      </button>
      <Link
        to="/settings"
        search={{}}
        aria-label={m.nav_settings()}
        title={m.nav_settings()}
        aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        className={cn("mb-1.5", railButton(pathname.startsWith("/settings")))}
      >
        <Settings size={18} strokeWidth={1.75} />
      </Link>
      <UserMenu />
    </nav>
  );
};

/** `bell`: the notifications (features/notifications), placed in the rail by the route. */
export const AppShell = ({ children, bell }: { children: ReactNode; bell?: ReactNode }) => {
  useVisibleHeight();
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  // "?" shows all shortcuts, 1–6 switch between the apps.
  const items = useNavItems();
  useShortcuts({
    "?": () => setHelp(true),
    ...Object.fromEntries(
      items.map(({ to }, index) => [String(index + 1), () => void navigate({ to })]),
    ),
  });
  return (
    <div className="flex h-[var(--app-height,100dvh)] overflow-hidden bg-bg text-fg safe-top md:pt-0">
      <Rail onHelp={() => setHelp(true)} bell={bell} />
      <div className="flex min-w-0 flex-1">{children}</div>
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </div>
  );
};

/** "Mehr" in the tab bar: the other apps, the account and signing out. */
const MoreMenu = () => {
  const { logout } = useAuth();
  const { data: session } = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const phone = usePhoneNav();
  const moreItems = useMoreItems();
  const active = [...moreItems.map((entry) => entry.to), "/settings", "/phone"].some((to) =>
    pathname.startsWith(to),
  );
  return (
    <MenuRoot>
      <MenuTrigger
        className={cn(
          "flex w-16 flex-col items-center gap-1 text-[11px]",
          active ? "font-medium text-fg" : "text-muted",
        )}
      >
        <Ellipsis size={22} strokeWidth={1.75} />
        {m.nav_more()}
      </MenuTrigger>
      <MenuContent side="top" align="end">
        <MenuLabel>{session?.username ?? ""}</MenuLabel>
        <StorageSummary />
        <MenuSeparator />
        {moreItems.map(({ to, label, icon: Icon }) => (
          <MenuItem key={to} asChild>
            <Link to={to} className="text-fg no-underline">
              <Icon size={15} /> {label()}
            </Link>
          </MenuItem>
        ))}
        {phone ? (
          <MenuItem asChild>
            <Link to="/phone" className="text-fg no-underline">
              <Phone size={15} /> {m.nav_phone()}
            </Link>
          </MenuItem>
        ) : null}
        <MenuItem asChild>
          <Link to="/settings" search={{}} className="text-fg no-underline">
            <Settings size={15} /> {m.nav_settings()}
          </Link>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={logout}>
          <LogOut size={15} /> {m.logout()}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
};

/** The tab bar of the phone views; each list screen places it at its bottom. */
export const TabBar = () => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const chatUnread = useChatUnread();
  return (
    <nav
      aria-label="Apps"
      className="flex shrink-0 justify-around border-t border-border bg-bg px-3 pt-2 safe-bottom md:hidden"
    >
      {TAB_ITEMS.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        const unread = to === "/chat" ? chatUnread : 0;
        return (
          <Link
            key={to}
            to={to}
            aria-label={unreadLabel(label(), unread)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex w-16 flex-col items-center gap-1 text-[11px] no-underline",
              active ? "font-medium text-fg" : "text-muted",
            )}
          >
            <Icon size={22} strokeWidth={1.75} />
            {label()}
            <UnreadBadge count={unread} className="-top-1 left-[calc(50%+4px)]" />
          </Link>
        );
      })}
      <MoreMenu />
    </nav>
  );
};
