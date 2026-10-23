/** The frame of every logged-in page: the app rail on the left (desktop), the page beside it. */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Settings } from "lucide-react";
import { type ReactNode, useState } from "react";
import { useAuth, useClient } from "@/auth/auth";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { Avatar } from "@/components/ui/avatar";
import { MenuContent, MenuItem, MenuLabel, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { useShortcuts } from "@/components/use-shortcuts";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { NAV_ITEMS } from "./nav-items";

export const useSession = () => {
  const client = useClient();
  return useQuery({
    queryKey: ["session"],
    queryFn: () => client.getSession(),
    staleTime: Number.POSITIVE_INFINITY,
  });
};

const UserMenu = ({ side }: { side: "right" | "top" }) => {
  const { logout } = useAuth();
  const { data: session } = useSession();
  const name = session?.username ?? "";
  return (
    <MenuRoot>
      <MenuTrigger
        aria-label={name}
        className="flex items-center justify-center rounded-full outline-offset-2"
      >
        <Avatar name={name} size={side === "top" ? 24 : 32} />
      </MenuTrigger>
      <MenuContent side={side} align={side === "right" ? "end" : "end"}>
        <MenuLabel>{name}</MenuLabel>
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

const Rail = () => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav
      aria-label="Apps"
      className="hidden h-full w-[60px] shrink-0 flex-col items-center gap-1.5 border-r border-border bg-side py-3.5 md:flex"
    >
      <div
        aria-hidden="true"
        className="mb-3.5 flex size-8 items-center justify-center rounded-[9px] bg-primary text-[13px] font-semibold text-onprimary"
      >
        S
      </div>
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            aria-label={label()}
            title={label()}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex size-10 items-center justify-center rounded-[10px] hover:bg-hover",
              active ? "bg-subtle text-fg" : "text-muted",
            )}
          >
            <Icon size={18} strokeWidth={1.75} />
          </Link>
        );
      })}
      <div className="flex-1" />
      <Link
        to="/settings"
        search={{}}
        aria-label={m.nav_settings()}
        title={m.nav_settings()}
        aria-current={pathname.startsWith("/settings") ? "page" : undefined}
        className={cn(
          "mb-1.5 flex size-10 items-center justify-center rounded-[10px] hover:bg-hover",
          pathname.startsWith("/settings") ? "bg-subtle text-fg" : "text-muted",
        )}
      >
        <Settings size={18} strokeWidth={1.75} />
      </Link>
      <UserMenu side="right" />
    </nav>
  );
};

export const AppShell = ({ children }: { children: ReactNode }) => {
  const navigate = useNavigate();
  const [help, setHelp] = useState(false);
  // "?" shows all shortcuts, 1–3 switch between the apps.
  useShortcuts({
    "?": () => setHelp(true),
    ...Object.fromEntries(
      NAV_ITEMS.map(({ to }, index) => [String(index + 1), () => void navigate({ to })]),
    ),
  });
  return (
    <div className="flex h-dvh overflow-hidden bg-bg text-fg safe-top md:pt-0">
      <Rail />
      <div className="flex min-w-0 flex-1">{children}</div>
      <ShortcutsDialog open={help} onOpenChange={setHelp} />
    </div>
  );
};

/** The tab bar of the phone views; each list screen places it at its bottom. */
export const TabBar = () => {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <nav
      aria-label="Apps"
      className="flex shrink-0 justify-around border-t border-border bg-bg px-3 pt-2 safe-bottom md:hidden"
    >
      {NAV_ITEMS.map(({ to, label, icon: Icon }) => {
        const active = pathname.startsWith(to);
        return (
          <Link
            key={to}
            to={to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex w-16 flex-col items-center gap-1 text-[11px] no-underline",
              active ? "font-medium text-fg" : "text-muted",
            )}
          >
            <Icon size={22} strokeWidth={1.75} />
            {label()}
          </Link>
        );
      })}
      <div className="flex w-16 flex-col items-center gap-1 text-[11px] text-muted">
        <UserMenu side="top" />
        {m.nav_account()}
      </div>
    </nav>
  );
};
