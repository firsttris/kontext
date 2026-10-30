import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TabBar } from "./app-shell";
import { setTabChoice } from "./tab-bar-settings";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...props }: { to: string; children: ReactNode }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
  useRouterState: ({ select }: { select: (state: unknown) => unknown }) =>
    select({ location: { pathname: "/mail" } }),
}));
vi.mock("@/auth/auth", () => ({ useAuth: () => ({ logout: vi.fn() }) }));
vi.mock("./session", () => ({ useSession: () => ({ data: { username: "jonas@weber.test" } }) }));
vi.mock("./account-avatar", () => ({
  AccountAvatar: () => null,
  StorageSummary: () => null,
  storageText: () => "",
  useOwnQuota: () => null,
}));
vi.mock("@/components/shortcuts-dialog", () => ({ ShortcutsDialog: () => null }));
vi.mock("@/features/documents/queries", () => ({ useDocumentsUrl: () => null }));
vi.mock("@/features/documents/frame-store", () => ({ useFrameState: () => ({ unsaved: false }) }));
vi.mock("@/features/phone/queries", () => ({
  usePhone: () => ({ enabled: false, allowed: false }),
}));
vi.mock("@/features/notifications/app-badges", () => ({
  useAppBadges: () => ({ "/mail": 0, "/calendar": 2, "/tasks": 1, "/chat": 3 }),
}));

afterEach(() => {
  cleanup();
  setTabChoice(null);
});

const tabBar = () => screen.getByRole("navigation", { name: "Apps" });

describe("TabBar: what waits in each app", () => {
  it("names unread chat, invitations and new tasks with the default tabs", () => {
    render(<TabBar />);
    within(tabBar()).getByRole("link", { name: "Chat, 3 ungelesen" });
    within(tabBar()).getByRole("link", { name: "Kalender, 2 neu" });
    within(tabBar()).getByRole("link", { name: "Aufgaben, 1 neu" });
  });

  it("names an app without news plainly", () => {
    render(<TabBar />);
    within(tabBar()).getByRole("link", { name: "Mail" });
  });

  it("keeps the badge of an app moved under Mehr", () => {
    setTabChoice(["/mail", "/contacts", "/chat", "/tasks"]);
    render(<TabBar />);
    within(tabBar()).getByRole("button", { name: "Mehr, 2 neu" });
  });

  it("names the apps by their content, not an aria-label (label in name, WCAG 2.5.3)", () => {
    render(<TabBar />);
    // An aria-label "Kalender, 2 neu" beside the visible "Kalender" and badge "2" reads "Kalender2"
    // to axe, which the label does not contain.
    expect(tabBar().querySelectorAll("a[aria-label], button[aria-label]")).toHaveLength(0);
    expect(screen.getByText("2").getAttribute("aria-hidden")).toBe("true");
  });
});
