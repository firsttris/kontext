// @vitest-environment node
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createBackupControl } from "./backup";
import { backupRoutes } from "./backup-routes";
import { type BackupStatus, hostState } from "./backup-schema";

const NOW = Date.parse("2026-10-27T10:00:00Z");
const MINUTE = 60_000;

const status = (change: Partial<BackupStatus> = {}): BackupStatus => ({
  state: "idle",
  updatedAt: "2026-10-27T03:04:00Z",
  lastRun: { start: "2026-10-27T03:00:00Z", end: "2026-10-27T03:04:00Z", ok: true, message: "" },
  sizeBytes: 800_000,
  warnGb: 8,
  nextRun: "2026-10-28T03:00:00Z",
  target: "Cloudflare R2 (kontext-firma)",
  schedule: { enabled: true, time: "03:00" },
  ...change,
});

const dirs: string[] = [];
const setup = async () => {
  const dir = await mkdtemp(join(tmpdir(), "backup-"));
  dirs.push(dir);
  const control = createBackupControl(dir, () => NOW);
  const app = backupRoutes(control);
  const send = (method: string, path: string, body?: unknown) =>
    app.request(path, {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  const hostWrites = (value: unknown) => writeFile(join(dir, "status.json"), JSON.stringify(value));
  return { dir, control, send, hostWrites };
};

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("hostState", () => {
  it("is missing without a status", () => {
    expect(hostState(null, null, NOW)).toBe("missing");
  });

  it("is ready while the host answers", () => {
    expect(hostState(status(), null, NOW)).toBe("ready");
    // A wish of a minute ago: the host has a moment to take it up.
    expect(hostState(status(), NOW - MINUTE, NOW)).toBe("ready");
  });

  it("is stale when a wish is not taken up or a run is long overdue", () => {
    expect(hostState(status(), NOW - 5 * MINUTE, NOW)).toBe("stale");
    expect(hostState(status({ nextRun: "2026-10-27T03:00:00Z" }), null, NOW)).toBe("stale");
    // Running long is no sign of a missing host.
    expect(
      hostState(status({ state: "running", nextRun: "2026-10-27T03:00:00Z" }), null, NOW),
    ).toBe("ready");
  });
});

describe("Datensicherung", () => {
  it("answers with an empty state while the host has written nothing", async () => {
    const { send } = await setup();
    expect(await (await send("GET", "/")).json()).toEqual({
      settings: { enabled: true, time: "03:00" },
      status: null,
      requested: false,
      host: "missing",
      log: "",
    });
  });

  it("reads the host's status and log; the timer's schedule until Kontext set one", async () => {
    const { dir, send, hostWrites } = await setup();
    await hostWrites({ ...status(), schedule: { enabled: false, time: "02:30" } });
    await writeFile(join(dir, "log.txt"), "backup ok\n");
    const body = await (await send("GET", "/")).json();
    expect(body).toMatchObject({
      settings: { enabled: false, time: "02:30" },
      status: { target: "Cloudflare R2 (kontext-firma)", sizeBytes: 800_000 },
      host: "ready",
      log: "backup ok\n",
    });
  });

  it("takes a status that is not JSON as missing", async () => {
    const { dir, send } = await setup();
    await writeFile(join(dir, "status.json"), "{ halb");
    expect((await (await send("GET", "/")).json()).host).toBe("missing");
  });

  it("saves the time atomically and only as HH:MM", async () => {
    const { dir, send } = await setup();
    for (const time of ["3:00", "24:00", "03:60", "03:00:00", "03:00\nOnCalendar=*"]) {
      expect((await send("PUT", "/settings", { enabled: true, time })).status).toBe(400);
    }
    expect((await send("PUT", "/settings", { enabled: true, time: "23:59" })).status).toBe(200);
    expect(JSON.parse(await readFile(join(dir, "settings.json"), "utf8"))).toEqual({
      enabled: true,
      time: "23:59",
    });
    // No temporary file stays behind.
    expect(await readdir(dir)).toEqual(["settings.json"]);
  });

  it("asks for a run, not while one runs", async () => {
    const { dir, send, hostWrites } = await setup();
    expect((await send("POST", "/run")).status).toBe(200);
    expect(await readdir(dir)).toContain("run-now");
    expect((await (await send("GET", "/")).json()).requested).toBe(true);

    await hostWrites(status({ state: "running" }));
    expect((await send("POST", "/run")).status).toBe(409);
  });

  it("notices when the host does not take up a wish", async () => {
    const { dir, send, hostWrites } = await setup();
    await hostWrites(status({ updatedAt: "2026-10-27T09:00:00Z" }));
    await send("PUT", "/settings", { enabled: true, time: "04:00" });
    const written = new Date(NOW - 10 * MINUTE);
    await utimes(join(dir, "settings.json"), written, written);
    expect((await (await send("GET", "/")).json()).host).toBe("stale");
  });
});
