import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerDraftFlush } from "@/features/mail/draft-flush";

type Options = { onNeedReload?: () => void };
const registered: Options[] = [];

vi.mock("virtual:pwa-register/react", () => ({
  useRegisterSW: (options: Options) => {
    registered.push(options);
    return { needRefresh: [true, () => undefined], offlineReady: [false, () => undefined] };
  },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => () => undefined }));

const { PwaStatus } = await import("./pwa-status");

afterEach(cleanup);

describe("PwaStatus", () => {
  // "Neu laden" in another tab hands control to the new worker; vite-plugin-pwa then loads this
  // tab again on Workbox's "controlling" event, through onNeedReload when given, else
  // window.location.reload() (vite-plugin-pwa 2.0.0 src/client/build/register.ts,
  // showSkipWaitingPrompt): this tab's open mails are saved first, too.
  it("saves this tab's open drafts before an update from another tab loads it again", async () => {
    const order: string[] = [];
    const reload = vi.fn(() => order.push("reload"));
    const location = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...location, reload },
    });
    const unregister = registerDraftFlush(async () => {
      order.push("save");
    });
    try {
      render(<PwaStatus />);
      const onNeedReload = registered.at(-1)?.onNeedReload;
      expect(onNeedReload).toBeTypeOf("function");
      onNeedReload?.();
      await vi.waitFor(() => expect(reload).toHaveBeenCalledOnce());
      expect(order).toEqual(["save", "reload"]);
    } finally {
      unregister();
      Object.defineProperty(window, "location", { configurable: true, value: location });
    }
  });
});
