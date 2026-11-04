// @vitest-environment node
import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

/**
 * dev/dev.ts in small: LiveKit (optional), Stalwart (ready over IPC), then the server and Vite,
 * each a stand-in that starts a process of its own, as `bunx vite` and dev/stalwart.ts do.
 */
const harness = (supervise: string) => `
import { supervise } from ${JSON.stringify(supervise)};
const processes = supervise();
const standIn = (name: string) => ["bun", "stand-in.ts", name];
const stdio = ["ignore", "inherit", "inherit"] as const;
processes.startOptional(standIn("livekit"), { stdio: [...stdio] });
try {
  await new Promise<void>((ready, fail) => {
    const stalwart = processes.start(standIn("stalwart"), {
      stdio: [...stdio],
      ipc: (message) => message === "ready" && ready(),
    });
    stalwart.exited.then(fail);
  });
} catch {
  process.exit(await processes.shutdown(1));
}
processes.start(standIn("server"), { stdio: [...stdio] });
processes.start(standIn("vite"), { stdio: [...stdio] });
process.exit(await processes.run());
`;

/**
 * Starts a grandchild and writes both pids. "server" exits with 7 once the file `crash` is there,
 * "stalwart" with 1 before it is ready (once LiveKit runs) when `stalwart-fails` is there.
 */
const standIn = `
const name = process.argv[2];
const grandchild = Bun.spawn(["sleep", "300"], { stdio: ["ignore", "ignore", "ignore"] });
await Bun.write(name + ".pids", process.pid + " " + grandchild.pid);
if (name === "stalwart" && (await Bun.file("stalwart-fails").exists())) {
  // only once LiveKit runs, which the test then expects to be stopped
  while (!(await Bun.file("livekit.pids").exists())) await Bun.sleep(50);
  process.exit(1);
}
process.send?.("ready");
if (name === "server") {
  while (!(await Bun.file("crash").exists())) await Bun.sleep(50);
  process.exit(7);
}
await grandchild.exited;
`;

const names = ["livekit", "stalwart", "server", "vite"];

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const waitFor = async (check: () => boolean, ms: number) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return true;
    await new Promise((done) => setTimeout(done, 50));
  }
  return check();
};

describe("dev/supervise.ts", () => {
  let dir = "";
  let dev: ChildProcess | undefined;
  const pids: number[] = [];

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kontext-dev-"));
  });

  afterEach(() => {
    // Only what this test started: the harness, the stand-ins and their grandchildren.
    for (const pid of pids) if (alive(pid)) process.kill(pid, "SIGKILL");
    pids.length = 0;
    if (dev?.pid && alive(dev.pid)) dev.kill("SIGKILL");
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  /** Starts the harness and resolves once every stand-in and grandchild runs, with its exit. */
  const startDev = async (expected = names) => {
    writeFileSync(join(dir, "dev.ts"), harness(resolve(__dirname, "supervise.ts")));
    writeFileSync(join(dir, "stand-in.ts"), standIn);
    const exited = new Promise<number | null>((done) => {
      dev = spawn("bun", ["dev.ts"], { cwd: dir, stdio: "ignore" });
      dev.on("exit", (code, signal) => done(code ?? (signal ? -1 : null)));
    });
    const files = expected.map((name) => join(dir, `${name}.pids`));
    const started = await waitFor(
      () => files.every((file) => existsSync(file) && readFileSync(file, "utf8").includes(" ")),
      10_000,
    );
    expect(started).toBe(true);
    for (const file of files) pids.push(...readFileSync(file, "utf8").split(" ").map(Number));
    // In an object: an async function would wait for a returned promise itself.
    return { exited };
  };

  const expectAllStopped = async () => {
    await waitFor(() => pids.every((pid) => !alive(pid)), 5_000);
    expect(pids.filter(alive)).toEqual([]);
  };

  // Ctrl+C reaches only dev.ts's process group, an IDE's stop and `kill` send SIGTERM to dev.ts
  // alone, closing the terminal sends SIGHUP: dev.ts has to pass each on.
  it.each([
    ["SIGINT", 130],
    ["SIGTERM", 143],
    ["SIGHUP", 129],
  ] as const)(
    "stops every process and what it started on %s",
    async (signal, code) => {
      const { exited } = await startDev();

      dev!.kill(signal);

      await expectAllStopped();
      expect(await exited).toBe(code);
    },
    20_000,
  );

  it("stops the rest, with what they started, when one exits, and exits with its code", async () => {
    const { exited } = await startDev();

    writeFileSync(join(dir, "crash"), "");

    await expectAllStopped();
    expect(await exited).toBe(7);
  }, 20_000);

  it("stops LiveKit, with what it started, when Stalwart does not come up", async () => {
    writeFileSync(join(dir, "stalwart-fails"), "");
    const { exited } = await startDev(["livekit"]);

    expect(await exited).toBe(1);
    await expectAllStopped();
  }, 20_000);

  /** The state letter `ps` shows for each pid (T: stopped). */
  const states = (of: number[]) =>
    of.map((pid) => {
      const ps = spawnSync("ps", ["-o", "stat=", "-p", String(pid)], { encoding: "utf8" });
      return ps.stdout.trim()[0];
    });

  // Ctrl+Z reaches only dev.ts: the processes run in sessions of their own. Left running, Vite
  // would keep reading the terminal and swallow what is typed into the shell.
  it("stops every process on SIGTSTP (Ctrl+Z) and lets them go on on SIGCONT (fg)", async () => {
    await startDev();
    const all = [dev!.pid!, ...pids];

    dev!.kill("SIGTSTP");

    await waitFor(() => states(all).every((state) => state === "T"), 3_000);
    expect(states(all)).toEqual(all.map(() => "T"));

    dev!.kill("SIGCONT");

    await waitFor(() => states(all).every((state) => state !== "T"), 3_000);
    expect(states(all).filter((state) => state === "T")).toEqual([]);
  }, 20_000);
});
