import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
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

/** A list of the account on the screen that, once shown, takes its time to load again. */
const loads = { count: 0 };
const useSlowList = () =>
  useQuery({
    queryKey: ["jonas", "list"],
    queryFn: () => (loads.count++ === 0 ? Promise.resolve([]) : new Promise<never[]>(() => {})),
  });

const setup = (withSlowList = false) => {
  const seeded = { ...createStore(), user: "jonas" };
  store.current = seeded;
  loads.count = 0;
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const useActions = withSlowList
    ? () => {
        useSlowList();
        return useMailActions();
      }
    : useMailActions;
  const { result } = renderHook(useActions, { wrapper });
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

describe("moving", () => {
  // The notice with "Rückgängig" and `z` (undo.ts) wait for the move's answer: while the lists
  // were still loading again, `z` found nothing to take back (e2e/selection.spec.ts, "e", "z").
  it("answers once the server moved the mails, without waiting for the lists to load again", async () => {
    const { actions, mail } = setup(true);
    await act(() => new Promise((resolve) => setTimeout(resolve, 10)));
    const moved = actions().moveTo("jonas", [mail as unknown as EmailSummary], "jonas-inbox", {
      accountId: "jonas",
      mailboxId: "jonas-Archiv",
    });
    const late = new Promise((resolve) => setTimeout(() => resolve("still waiting"), 500));
    expect(await act(() => Promise.race([moved, late]))).toMatchObject({ to: "jonas-Archiv" });
  });
});
