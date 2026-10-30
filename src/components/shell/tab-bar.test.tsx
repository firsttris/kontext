import { cleanup, render, screen } from "@testing-library/react";
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

/** Everything the tab bar tells a sighted or screen-reader user without opening a menu. */
const told = () => {
  const nav = screen.getByRole("navigation", { name: "Apps" });
  const labels = [...nav.querySelectorAll("[aria-label]")].map((el) =>
    el.getAttribute("aria-label"),
  );
  return `${nav.textContent} ${labels.join(" | ")}`;
};

describe("TabBar: what waits in each app", () => {
  it("shows unread chat, invitations and new tasks with the default tabs", () => {
    render(<TabBar />);
    expect(told()).toMatch(/Chat, 3 ungelesen/);
    expect(told()).toMatch(/Kalender, 2 neu/);
    expect(told()).toMatch(/Aufgaben, 1 neu/);
  });

  it("hides the number from screen readers, the label says it (label in name, WCAG 2.5.3)", () => {
    render(<TabBar />);
    expect(screen.getByText("2").getAttribute("aria-hidden")).toBe("true");
  });

  it("names an app without news plainly", () => {
    render(<TabBar />);
    expect(told()).toMatch(/Mehr Mail \| Kalender/);
  });

  it("keeps the badge of an app moved under Mehr", () => {
    setTabChoice(["/mail", "/contacts", "/chat", "/tasks"]);
    render(<TabBar />);
    expect(told()).toMatch(/Mehr, 2 neu/);
  });
});
