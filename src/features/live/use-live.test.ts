import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { PHONE_KEY } from "@/features/phone/queries";
import type { PhoneCall } from "@/lib/phone";
import { applyLiveEvent } from "./use-live";

const call = (state: PhoneCall["state"]) =>
  ({ id: "c1", state, startedAt: "2026-10-25T10:00:00Z" }) as PhoneCall;

describe("applyLiveEvent", () => {
  it("fetches the calls anew when a change comes while their first fetch is under way", async () => {
    const queryClient = new QueryClient();
    // The first answer was read while the call still rang; it was answered before it arrived.
    const answers = [{ calls: [call("ringing")] }, { calls: [call("talking")] }];
    // Watched like the page's usePhone, which starts the first fetch.
    const watching = new QueryObserver(queryClient, {
      queryKey: PHONE_KEY,
      queryFn: async () => {
        const answer = answers.shift();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return answer;
      },
    }).subscribe(() => undefined);
    applyLiveEvent(queryClient, "anna", { type: "phone", call: call("talking") });
    await expect
      .poll(() => queryClient.getQueryData<{ calls: PhoneCall[] }>(PHONE_KEY)?.calls[0]?.state)
      .toBe("talking");
    watching();
  });

  it("changes loaded calls in place", () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(PHONE_KEY, { calls: [call("ringing")] });
    applyLiveEvent(queryClient, "anna", { type: "phone", call: call("talking") });
    expect(queryClient.getQueryData<{ calls: PhoneCall[] }>(PHONE_KEY)?.calls[0]?.state).toBe(
      "talking",
    );
  });
});
