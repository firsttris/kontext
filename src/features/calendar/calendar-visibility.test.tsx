import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const server = vi.hoisted(() => ({
  call: vi.fn<(method: string, args: Record<string, unknown>) => Promise<unknown>>(),
}));
vi.mock("@/auth/auth", () => ({ useClient: () => server }));
vi.mock("@/components/shell/app-shell", () => ({
  useSession: () => ({
    data: {
      username: "anna@weber.test",
      primaryAccounts: { "urn:ietf:params:jmap:calendars": "a" },
      accounts: {
        a: {
          name: "anna@weber.test",
          isPersonal: true,
          accountCapabilities: { "urn:ietf:params:jmap:calendars": {} },
        },
      },
    },
  }),
}));
vi.mock("../sharing/queries", () => ({ usePrincipals: () => ({ data: [] }) }));

const calendar = { id: "c1", name: "Baustellen", isVisible: true, isDefault: false };
const STORAGE = "kontext.hiddenCalendars";

/** Each test's query client, for the provider around its hooks. */
let client = new QueryClient();
const Wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe("the one-time move of a device's hidden calendars", () => {
  beforeEach(() => {
    vi.resetModules();
    server.call.mockReset();
    localStorage.setItem(STORAGE, JSON.stringify(["a:c1"]));
  });

  it("keeps the device's choice when the server never took it (network down)", async () => {
    let online = true;
    server.call.mockImplementation(async (method) => {
      if (!online) throw new Error("Failed to fetch");
      if (method === "Calendar/get") return { list: [calendar] };
      online = false; // The connection drops while the calendar is being hidden.
      throw new Error("Failed to fetch");
    });
    const { useCalendarRefs } = await import("./queries");
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { rerender } = renderHook(() => useCalendarRefs(), {
      wrapper: Wrapper,
    });
    await waitFor(() =>
      expect(server.call.mock.calls.filter(([m]) => m === "Calendar/set")).toHaveLength(1),
    );
    await waitFor(() => expect(client.isMutating()).toBe(0));
    await act(async () => rerender());
    await act(async () => rerender());

    // The server still shows the calendar, so this device must not forget that it hid it.
    expect(JSON.parse(localStorage.getItem(STORAGE) ?? "[]")).toContain("a:c1");
  });

  it("puts the box back when hiding fails and the list cannot be reloaded", async () => {
    localStorage.setItem(STORAGE, "[]");
    let online = true;
    server.call.mockImplementation(async (method) => {
      if (online && method === "Calendar/get") return { list: [calendar] };
      online = false;
      throw new Error("Failed to fetch");
    });
    const { useCalendarRefs, useSetCalendarVisible } = await import("./queries");
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result, rerender } = renderHook(
      () => ({ refs: useCalendarRefs(), setVisible: useSetCalendarVisible() }),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.refs.calendars).toHaveLength(1));
    const ref = result.current.refs.calendars[0]!;
    await act(async () => {
      await result.current.setVisible
        .mutateAsync({ calendar: ref, visible: false })
        .catch(() => {});
    });
    await act(async () => rerender());

    // Nothing changed on the server: the calendar is shown, as before the click.
    expect(result.current.refs.calendars[0]?.visible).toBe(true);
  });
});

describe("the move with several calendar lists on the page", () => {
  beforeEach(() => {
    vi.resetModules();
    server.call.mockReset();
    localStorage.setItem(STORAGE, JSON.stringify(["a:c1"]));
  });

  it("hides each calendar on the server once, not once per list", async () => {
    server.call.mockImplementation(async (method) =>
      method === "Calendar/get" ? { list: [calendar] } : { updated: { c1: null } },
    );
    const { useCalendarRefs } = await import("./queries");
    client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    // The sidebar, the week view and the notification feed each read the calendars.
    renderHook(() => [useCalendarRefs(), useCalendarRefs(), useCalendarRefs()], {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(localStorage.getItem(STORAGE)).toBe("[]"));
    await waitFor(() => expect(client.isMutating()).toBe(0));

    expect(server.call.mock.calls.filter(([m]) => m === "Calendar/set")).toHaveLength(1);
  });
});
