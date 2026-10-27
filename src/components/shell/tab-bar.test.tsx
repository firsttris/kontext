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
vi.mock("@/features/chat/queries", () => ({
  useChannels: () => ({ channels: [{ unread: 3, muted: false }] }),
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

describe("TabBar: unread chat messages", () => {
  it("shows them with the default tabs (as on main)", () => {
    render(<TabBar />);
    expect(told()).toMatch(/3 ungelesen/);
  });

  it("still shows them when Chat was moved under Mehr", () => {
    setTabChoice(["/mail", "/calendar", "/tasks", "/contacts"]);
    render(<TabBar />);
    expect(told()).toMatch(/Mehr, 3 ungelesen/);
  });
});
