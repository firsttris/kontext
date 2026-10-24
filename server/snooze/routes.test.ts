// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SessionInfo } from "../session-info";
import { createSnoozeRoutes } from "./routes";
import type { Snooze } from "./snooze";
import type { SnoozeStore } from "./store";

const memoryStore = () => {
  const rows: (Snooze & { userId: string })[] = [];
  const store: SnoozeStore = {
    list: async (accountId) => rows.filter((row) => row.accountId === accountId),
    put: async (snoozes, userId) => {
      for (const snooze of snoozes) {
        const at = rows.findIndex(
          (row) => row.accountId === snooze.accountId && row.emailId === snooze.emailId,
        );
        if (at >= 0) rows.splice(at, 1);
        rows.push({ ...snooze, userId });
      }
    },
    remove: async (accountId, ids) => {
      for (const id of ids) {
        const at = rows.findIndex((row) => row.accountId === accountId && row.emailId === id);
        if (at >= 0) rows.splice(at, 1);
      }
    },
    due: async () => [],
    userOf: async (sessionId) => `user-${sessionId}`,
    sessionsFor: async () => [],
  };
  return { rows, store };
};

const jonas: SessionInfo = {
  sessionId: "s-jonas",
  name: "Jonas",
  accounts: [
    { id: "jonas", isPersonal: true, isReadOnly: false },
    { id: "info", isPersonal: false, isReadOnly: false },
  ],
};
const max: SessionInfo = {
  sessionId: "s-max",
  name: "Max",
  accounts: [
    { id: "max", isPersonal: true, isReadOnly: false },
    { id: "info", isPersonal: false, isReadOnly: true },
  ],
};

const NOW = new Date("2026-10-24T10:00:00Z");

describe("/api/snoozes", () => {
  it("puts mails away for writers, shows them to everyone in the mailbox", async () => {
    let who = jonas;
    const { rows, store } = memoryStore();
    const app = createSnoozeRoutes({ store, infoOf: async () => who, now: () => NOW });
    const send = (method: string, path: string, body?: unknown) =>
      app.request(path, {
        method,
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
    const until = "2026-10-26T07:00:00.000Z";

    expect(
      (await send("PUT", "/", { accountId: "info", emailIds: ["m1", "m2"], until })).status,
    ).toBe(200);
    expect(rows).toEqual([
      { accountId: "info", emailId: "m1", until, by: "jonas", userId: "user-s-jonas" },
      { accountId: "info", emailId: "m2", until, by: "jonas", userId: "user-s-jonas" },
    ]);

    who = max;
    const listed = (await (await send("GET", "/?accountId=info")).json()) as { snoozes: Snooze[] };
    expect(listed.snoozes.map((snooze) => snooze.emailId)).toEqual(["m1", "m2"]);
    // Max only reads info@: neither puts away nor takes out.
    expect((await send("PUT", "/", { accountId: "info", emailIds: ["m3"], until })).status).toBe(
      403,
    );
    expect((await send("POST", "/remove", { accountId: "info", emailIds: ["m1"] })).status).toBe(
      403,
    );
    // Not his mailbox: nothing to see.
    expect(await (await send("GET", "/?accountId=jonas")).json()).toEqual({ snoozes: [] });

    who = jonas;
    expect((await send("POST", "/remove", { accountId: "info", emailIds: ["m1"] })).status).toBe(
      200,
    );
    expect(rows.map((row) => row.emailId)).toEqual(["m2"]);
  });

  it("refuses a time that has passed", async () => {
    const app = createSnoozeRoutes({
      store: memoryStore().store,
      infoOf: async () => jonas,
      now: () => NOW,
    });
    const response = await app.request("/", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ accountId: "jonas", emailIds: ["m1"], until: "2026-10-24T09:00:00Z" }),
    });
    expect(response.status).toBe(400);
  });

  it("asks who it is", async () => {
    const app = createSnoozeRoutes({ store: memoryStore().store, infoOf: async () => null });
    expect((await app.request("/?accountId=jonas")).status).toBe(401);
  });
});
