import { describe, expect, it } from "vitest";
import type { SubscribedCalendars } from "./calendars";
import { createSubscriptionRoutes, MAX_SUBSCRIPTIONS } from "./routes";
import { createSubscriptionRunner, EVERY_MS, isDue } from "./runner";
import type { Subscription, SubscriptionStore } from "./store";
import type { SyncPlan } from "./sync-plan";

const ics = (title: string) =>
  `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:u1\r\nSUMMARY:${title}\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`;

const memoryStore = (): SubscriptionStore => {
  const rows = new Map<string, Subscription>();
  return {
    all: async () => [...rows.values()],
    of: async (memberId) => [...rows.values()].filter((row) => row.memberId === memberId),
    get: async (memberId, id) => {
      const row = rows.get(id);
      return row && row.memberId === memberId ? row : null;
    },
    add: async (row) => {
      rows.set(row.id, { ...row, written: "{}", lastSyncAt: null, lastError: null });
    },
    synced: async (id, result, at) => {
      const row = rows.get(id)!;
      rows.set(
        id,
        "error" in result
          ? { ...row, lastSyncAt: at, lastError: result.error }
          : { ...row, lastSyncAt: at, lastError: null, written: JSON.stringify(result.written) },
      );
    },
    remove: async (memberId, id) => {
      if (rows.get(id)?.memberId === memberId) rows.delete(id);
    },
  };
};

const setup = () => {
  let page = ics("Gelber Sack");
  const plans: SyncPlan[] = [];
  const removed: string[] = [];
  const events: { id: string; uid: string }[] = [];
  let present = true;
  const calendars = {
    create: async () => "cal-1",
    exists: async () => present,
    remove: async (_account: string, id: string) => {
      removed.push(id);
    },
    events: async () => events,
    // Stalwart's parse, as far as the test needs it: the summary as title.
    parse: async (_account: string, text: string) => {
      const title = text.match(/SUMMARY:(.*)\r\n/)?.[1];
      return title ? [{ uid: "u1", title }] : [];
    },
    apply: async (_account: string, _calendar: string, plan: SyncPlan) => {
      plans.push(plan);
      for (const { uid } of plan.create) events.push({ id: `e-${uid}`, uid });
    },
  } as unknown as SubscribedCalendars;
  const fetchDeps = {
    anyTarget: true,
    fetch: (async (url: URL | string) =>
      String(url).endsWith("/muell.ics")
        ? new Response(page)
        : new Response("nicht da", { status: 404 })) as typeof fetch,
  };
  const store = memoryStore();
  const runner = createSubscriptionRunner({ store, calendars, fetchDeps });
  const app = createSubscriptionRoutes({
    store,
    calendars,
    runner,
    fetchDeps,
    accountsOf: async (request) =>
      request.headers.get("cookie")
        ? [{ id: request.headers.get("cookie")!, isPersonal: true } as never]
        : null,
  });
  const call = (method: string, path: string, body?: unknown, who = "jonas") =>
    app.request(path, {
      method,
      headers: { ...(who ? { cookie: who } : {}), "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  return {
    call,
    plans,
    removed,
    setPage: (text: string) => (page = text),
    deleteCalendar: () => (present = false),
    store,
    runner,
  };
};

describe("/api/calendar-subscriptions", () => {
  it("subscribes: fetches first, then a calendar with the events", async () => {
    const { call, plans } = setup();
    const response = await call("POST", "/", {
      url: "webcal://kal.test/muell.ics",
      name: "Müllabfuhr",
    });
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      name: "Müllabfuhr",
      calendarId: "cal-1",
      accountId: "jonas",
      lastError: null,
      lastSyncAt: expect.any(String),
    });
    expect(plans[0]?.create).toEqual([{ uid: "u1", event: { title: "Gelber Sack" } }]);
    expect((await (await call("GET", "/")).json()).subscriptions).toHaveLength(1);
    expect((await (await call("GET", "/", undefined, "anna")).json()).subscriptions).toEqual([]);
  });

  it("creates nothing for an address without a calendar", async () => {
    const { call, store } = setup();
    const response = await call("POST", "/", { url: "https://kal.test/fehlt.ics", name: "X" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Der Kalender antwortet mit 404." });
    expect(await store.all()).toEqual([]);
  });

  it("refreshes on request: only what changed is written", async () => {
    const { call, plans, setPage } = setup();
    const { id } = await (
      await call("POST", "/", { url: "https://kal.test/muell.ics", name: "M" })
    ).json();
    await call("POST", `/${id}/refresh`);
    expect(plans[1]).toMatchObject({ create: [], update: [], destroy: [] });
    setPage(ics("Gelber Sack (neu)"));
    await call("POST", `/${id}/refresh`);
    expect(plans[2]?.update).toEqual([
      { id: "e-u1", uid: "u1", event: { title: "Gelber Sack (neu)" } },
    ]);
  });

  it("keeps the error of a run with the subscription", async () => {
    const { call, setPage } = setup();
    const { id } = await (
      await call("POST", "/", { url: "https://kal.test/muell.ics", name: "M" })
    ).json();
    setPage("<html>Wartung</html>");
    expect(await (await call("POST", `/${id}/refresh`)).json()).toMatchObject({
      lastError: "Unter dieser Adresse liegt kein Kalender (iCal).",
    });
  });

  it("removes the subscription with its calendar, only one's own", async () => {
    const { call, removed } = setup();
    const { id } = await (
      await call("POST", "/", { url: "https://kal.test/muell.ics", name: "M" })
    ).json();
    expect((await call("DELETE", `/${id}`, undefined, "anna")).status).toBe(404);
    expect((await call("DELETE", `/${id}`)).status).toBe(204);
    expect(removed).toEqual(["cal-1"]);
    expect((await (await call("GET", "/")).json()).subscriptions).toEqual([]);
  });

  it("ends the subscription of a calendar its owner deleted", async () => {
    const { call, deleteCalendar, runner, store } = setup();
    await call("POST", "/", { url: "https://kal.test/muell.ics", name: "M" });
    deleteCalendar();
    const [subscription] = await store.all();
    expect(await runner.sync(subscription!)).toBe("gone");
    expect(await store.all()).toEqual([]);
  });

  it("refuses strangers, missing fields and too many", async () => {
    const { call } = setup();
    expect((await call("GET", "/", undefined, "")).status).toBe(401);
    expect((await call("POST", "/", { url: "https://kal.test/muell.ics" })).status).toBe(400);
    for (let n = 0; n < MAX_SUBSCRIPTIONS; n++) {
      await call("POST", "/", { url: "https://kal.test/muell.ics", name: `K${n}` });
    }
    expect(
      (await call("POST", "/", { url: "https://kal.test/muell.ics", name: "zu viel" })).status,
    ).toBe(400);
  });
});

describe("isDue", () => {
  it("is due when never fetched or six hours ago", () => {
    const now = new Date("2026-11-01T12:00:00Z");
    expect(isDue({ lastSyncAt: null }, now)).toBe(true);
    expect(isDue({ lastSyncAt: new Date(now.getTime() - EVERY_MS) }, now)).toBe(true);
    expect(isDue({ lastSyncAt: new Date(now.getTime() - EVERY_MS + 60_000) }, now)).toBe(false);
  });
});

describe("the runner", () => {
  const subscription = (id: string) => ({
    id,
    memberId: id,
    accountId: id,
    calendarId: `cal-${id}`,
    name: id,
    url: "https://kal.test/muell.ics",
    createdAt: new Date(),
  });
  const fetchDeps = {
    anyTarget: true,
    fetch: (async () => new Response(ics("Gelber Sack"))) as unknown as typeof fetch,
  };

  it("goes on with the others when one subscription's run throws", async () => {
    const store = memoryStore();
    await store.add(subscription("a"));
    await store.add(subscription("b"));
    const calendars = {
      exists: async (account: string) => {
        if (account === "a") throw new Error("accountNotFound");
        return true;
      },
      events: async () => [],
      parse: async () => [{ uid: "u1", title: "Gelber Sack" }],
      apply: async () => {},
    } as unknown as SubscribedCalendars;
    const runner = createSubscriptionRunner({ store, calendars, fetchDeps });
    await runner.tick().catch(() => {});
    expect((await store.get("b", "b"))?.lastSyncAt).not.toBeNull();
  });

  it("does not write a subscription twice at the same time (refresh during a run)", async () => {
    const store = memoryStore();
    await store.add(subscription("a"));
    const events: { id: string; uid: string }[] = [];
    const calendars = {
      exists: async () => true,
      events: async () => [...events],
      parse: async () => [{ uid: "u1", title: "Gelber Sack" }],
      apply: async (_account: string, _calendar: string, plan: SyncPlan) => {
        for (const { uid } of plan.create) events.push({ id: `e-${events.length}`, uid });
      },
    } as unknown as SubscribedCalendars;
    const runner = createSubscriptionRunner({ store, calendars, fetchDeps });
    const row = (await store.get("a", "a"))!;
    await Promise.all([runner.sync(row), runner.sync(row)]);
    expect(events.filter((event) => event.uid === "u1")).toHaveLength(1);
  });
});
