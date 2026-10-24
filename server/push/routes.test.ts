// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createPushRoutes, isPushService } from "./routes";
import type { PushStore } from "./store";

describe("isPushService", () => {
  it("lets through the browsers' push services only", () => {
    for (const endpoint of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/abc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) {
      expect(isPushService(endpoint)).toBe(true);
    }
    for (const endpoint of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://stalwart:8080/jmap",
      "https://evilgoogleapis.com/x",
      "https://127.0.0.1/push",
      "not a url",
    ]) {
      expect(isPushService(endpoint)).toBe(false);
    }
    expect(isPushService("http://127.0.0.1:9999/push", true)).toBe(true);
  });
});

describe("/api/push", () => {
  const keys = { p256dh: "B".repeat(87), auth: "A".repeat(22) };
  const setup = () => {
    const saved: { endpoint: string; memberId: string; sessionId: string }[] = [];
    const off = new Set<string>();
    const store: PushStore = {
      save: async (target, memberId, sessionId) => {
        saved.push({ endpoint: target.endpoint, memberId, sessionId });
      },
      remove: async (endpoint) => {
        saved.splice(
          saved.findIndex((s) => s.endpoint === endpoint),
          1,
        );
      },
      targetsOf: async (ids) =>
        saved.filter((s) => ids.includes(s.memberId)).map((s) => ({ ...s, keys })),
      subscribers: async () => [],
      mailboxesOff: async () => [...off],
      setMailbox: async (_member, accountId, on) => {
        if (on) off.delete(accountId);
        else off.add(accountId);
      },
    };
    let who = "max";
    const app = createPushRoutes({
      store,
      publicKey: "BPublic",
      infoOf: async () => ({
        sessionId: `session-${who}`,
        name: who,
        accounts: [
          { id: who, isPersonal: true, isReadOnly: false },
          { id: "info", isPersonal: false, isReadOnly: false },
        ],
      }),
    });
    const send = (method: string, body: unknown) =>
      app.request("/subscriptions", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    return { app, saved, send, as: (id: string) => (who = id) };
  };

  it("keeps a browser's subscription with the session, and only its owner removes it", async () => {
    const { app, saved, send, as } = setup();
    expect(await (await app.request("/key")).json()).toEqual({ publicKey: "BPublic" });
    const endpoint = "https://fcm.googleapis.com/fcm/send/max-phone";
    expect((await send("POST", { endpoint, keys })).status).toBe(201);
    expect(saved).toEqual([{ endpoint, memberId: "max", sessionId: "session-max" }]);
    expect((await send("POST", { endpoint: "https://10.0.0.5/x", keys })).status).toBe(400);
    as("anna");
    await send("DELETE", { endpoint });
    expect(saved).toHaveLength(1);
    as("max");
    await send("DELETE", { endpoint });
    expect(saved).toHaveLength(0);
  });
  it("switches mail pushes off for a mailbox one can open, and on again", async () => {
    const { app } = setup();
    const put = (account: string, on: boolean) =>
      app.request(`/mailboxes/${account}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ on }),
      });
    expect(await (await put("info", false)).json()).toEqual({ off: ["info"] });
    expect((await put("rechnung", false)).status).toBe(404);
    expect(await (await app.request("/mailboxes")).json()).toEqual({ off: ["info"] });
    expect(await (await put("info", true)).json()).toEqual({ off: [] });
  });
});
