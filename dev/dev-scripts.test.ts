/**
 * The parts of `bun run dev` as `bun run --parallel` sees them: it stops all of them as soon as
 * one ends with an exit code other than 0, so the optional ones must not, and a failing one has to
 * say why. Each test runs a script as its own process.
 */
import { spawn } from "node:child_process";
import { chmod, copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LIVEKIT_VERSION } from "./config";

const dev = resolve(__dirname);

/** Runs `bun <script> <args>` and resolves with its exit code and output. */
const run = (script: string, args: string[], env: Record<string, string> = {}) =>
  new Promise<{ code: number | null; output: string }>((done) => {
    const child = spawn("bun", [script, ...args], { env: { ...process.env, ...env } });
    let output = "";
    child.stdout.on("data", (chunk) => (output += chunk));
    child.stderr.on("data", (chunk) => (output += chunk));
    child.on("exit", (code) => done({ code, output }));
  });

const listen = (server: Server) =>
  new Promise<number>((done) =>
    server.listen(0, "127.0.0.1", () => done((server.address() as AddressInfo).port)),
  );

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const step of cleanup.splice(0)) await step();
});

describe("dev/livekit.ts --optional", () => {
  it("ends with 0 when LiveKit fails to start, so the rest of bun run dev keeps running", async () => {
    // A copy of the script next to a LiveKit that fails at once, as with a port in use.
    const root = await mkdtemp(join(tmpdir(), "livekit-"));
    cleanup.push(() => rm(root, { recursive: true, force: true }));
    await mkdir(join(root, "dev"));
    await mkdir(join(root, ".dev", "bin"), { recursive: true });
    for (const file of ["livekit.ts", "config.ts", "download.ts"])
      await copyFile(join(dev, file), join(root, "dev", file));
    const failing =
      "#!/bin/sh\necho 'listen tcp :17881: bind: address already in use' >&2\nexit 1\n";
    for (const binary of [
      join(root, ".dev", "bin", `livekit-server-${LIVEKIT_VERSION}`),
      join(root, ".dev", "livekit-server"),
    ]) {
      await writeFile(binary, failing);
      await chmod(binary, 0o755);
    }
    const { code, output } = await run(
      join(root, "dev", "livekit.ts"),
      ["--optional", "--port", "1"],
      {
        // Outside Linux the script takes livekit-server from the PATH.
        PATH: `${join(root, ".dev")}:${process.env.PATH}`,
      },
    );
    expect(code).toBe(0);
    expect(output).toContain("Anrufe gehen ohne");
  }, 40_000);
});

describe("dev/stalwart.ts --reuse --seed", () => {
  it("says what is wrong when the service on the port is no Stalwart", async () => {
    const foreign = createServer((_, response) => response.end("fakeccu"));
    const port = await listen(foreign);
    cleanup.push(() => new Promise((done) => foreign.close(done)));
    const { code, output } = await run(join(dev, "stalwart.ts"), [
      "--reuse",
      "--seed",
      "--http",
      String(port),
    ]);
    expect(code).toBe(1);
    expect(output).toContain(
      `Auf ${port} antwortet ein Dienst, in den sich die Testdaten nicht einspielen lassen`,
    );
  }, 40_000);
});
