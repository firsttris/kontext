import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "@/demo/jmap";
import { createStore } from "@/demo/store";
import type { EmailSummary } from "@/jmap/types";
import { useMailActions } from "./actions";

// The demo server stands in for Stalwart: the patches the app sends land on the seed.
const store = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/auth/auth", () => ({
  useClient: () => ({
    call: async (name: string, args: Record<string, unknown>) => {
      const { methodResponses } = await handleRequest(
        store.current as Parameters<typeof handleRequest>[0],
        { methodCalls: [[name, args, "0"]] },
      );
      return methodResponses[0]![1];
    },
  }),
}));

const setup = () => {
  const seeded = { ...createStore(), user: "jonas" };
  store.current = seeded;
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => useMailActions(), { wrapper });
  const mail = [...seeded.emails.values()].find((email) => email.mailboxIds["jonas-inbox"])!;
  return { actions: () => result.current, mail, seeded };
};

describe("undoMove", () => {
  it("leaves a mail alone that left the folder since, e.g. by a second move", async () => {
    const { actions, mail, seeded } = setup();
    const summary = mail as unknown as EmailSummary;
    const first = await act(() =>
      actions().moveTo("jonas", [summary], "jonas-inbox", {
        accountId: "jonas",
        mailboxId: "jonas-Archiv",
      }),
    );
    // A second notice: from the archive on into the trash.
    await act(() =>
      actions().moveTo("jonas", [summary], "jonas-Archiv", {
        accountId: "jonas",
        mailboxId: "jonas-trash",
      }),
    );
    // The first notice's "Rückgängig", still on the screen.
    await act(() => actions().undoMove(first!));
    expect(seeded.emails.get(mail.id)!.mailboxIds).toEqual({ "jonas-trash": true });
  });

  it("does not fail for a mail deleted for good since", async () => {
    const { actions, mail, seeded } = setup();
    const summary = mail as unknown as EmailSummary;
    const trashed = await act(() =>
      actions().moveTo("jonas", [summary], "jonas-inbox", {
        accountId: "jonas",
        mailboxId: "jonas-trash",
      }),
    );
    // Emptied out of the trash, then "z".
    await act(() => actions().remove("jonas", [mail.id], "jonas-trash"));
    await act(() => actions().undoMove(trashed!));
    expect(seeded.emails.has(mail.id)).toBe(false);
  });
});
