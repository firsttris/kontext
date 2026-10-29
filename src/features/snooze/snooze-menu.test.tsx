import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useSnooze } from "./snooze-menu";

const undone = vi.hoisted(() => [] as string[]);
const snooze = vi.hoisted(() =>
  vi.fn(async (accountId: string) => {
    if (accountId === "info") throw new Error("Keine Rechte");
    return async () => void undone.push(accountId);
  }),
);
vi.mock("./queries", () => ({ useSnoozeActions: () => ({ snooze }) }));
const show = vi.hoisted(() => vi.fn());
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

describe("snoozing mails of several accounts", () => {
  it("takes back what was put away when another account's part fails", async () => {
    const { result } = renderHook(() => useSnooze());
    await result.current(
      [
        { accountId: "me", ids: ["1"], from: "inbox-me" },
        { accountId: "info", ids: ["2"], from: "inbox-info" },
      ],
      new Date("2026-11-02T08:00:00Z"),
    );
    expect(show).toHaveBeenCalledWith(expect.stringContaining("Keine Rechte"), "error");
    // All or nothing, as the selection bar promises: jonas's mail is back in his inbox.
    expect(undone).toEqual(["me"]);
  });
});
