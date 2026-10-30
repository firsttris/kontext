import { describe, expect, it } from "vitest";
import type { SessionRow } from "./devices";
import { createAccessRoutes } from "./routes";
import type { SessionStore } from "./store";

const row = (id: string, day: number): SessionRow => ({
  id,
  userAgent: "Mozilla/5.0 (X11; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0",
  ipAddress: null,
  createdAt: new Date(`2026-10-0${day}T08:00:00Z`),
  updatedAt: new Date(`2026-10-0${day}T08:00:00Z`),
  expiresAt: new Date("2099-01-01T00:00:00Z"),
  grantUpdatedAt: null,
});

/** Anna's laptop (this request), her phone and an app password; Jonas's browser elsewhere. */
const setup = (signedIn = true) => {
  const rows: Record<string, SessionRow[]> = {
    anna: [row("laptop", 1), row("phone", 2), row("caldav", 3)],
    jonas: [row("jonas-pc", 1)],
  };
  const ended: string[] = [];
  const sessions: SessionStore = {
    list: async (userId) => ({ rows: rows[userId] ?? [], heldIds: new Set(["caldav"]) }),
    end: async (userId, ids) => {
      const own = ids.filter((id) => rows[userId]?.some((r) => r.id === id));
      ended.push(...own);
      rows[userId] = (rows[userId] ?? []).filter((r) => !own.includes(r.id));
    },
  };
  const app = createAccessRoutes({
    sessions,
    sessionOf: async () => (signedIn ? { id: "laptop", userId: "anna" } : null),
  });
  const send = async (method: string, path: string) => {
    const response = await app.request(path, { method });
    return { status: response.status, body: await response.json() };
  };
  return { send, ended };
};

describe("/api/access", () => {
  it("lists the person's browsers, this one first, without the app password", async () => {
    const { body } = await setup().send("GET", "/sessions");
    expect(body.devices.map((d: { id: string; current: boolean }) => [d.id, d.current])).toEqual([
      ["laptop", true],
      ["phone", false],
    ]);
  });

  it("signs out another browser, never this one, an app password or someone else's", async () => {
    const { send, ended } = setup();
    expect((await send("DELETE", "/sessions/laptop")).status).toBe(400);
    expect((await send("DELETE", "/sessions/caldav")).status).toBe(404);
    expect((await send("DELETE", "/sessions/jonas-pc")).status).toBe(404);
    expect(ended).toEqual([]);
    expect((await send("DELETE", "/sessions/phone")).status).toBe(200);
    expect(ended).toEqual(["phone"]);
  });

  it("signs out all other browsers at once", async () => {
    const { send, ended } = setup();
    expect((await send("DELETE", "/sessions")).body).toEqual({ ended: 1 });
    expect(ended).toEqual(["phone"]);
  });

  it("answers nobody signed in", async () => {
    expect((await setup(false).send("GET", "/sessions")).status).toBe(401);
    expect((await setup(false).send("DELETE", "/sessions")).status).toBe(401);
  });
});
