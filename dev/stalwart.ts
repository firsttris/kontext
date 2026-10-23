/**
 * Runs a local Stalwart mail server for development and tests.
 *
 *   bun dev/stalwart.ts                 # dev instance, data in .dev/stalwart, HTTP on 18080
 *   bun dev/stalwart.ts --fresh         # wipe the dev data first
 *   bun dev/stalwart.ts --seed          # and fill it with the test data
 *   bun dev/stalwart.ts --instance e2e --http 28080 --smtp 20025 --imap 20143 --fresh --seed
 *
 * Stalwart 0.16 keeps all settings in its database, only the datastore is in config.json
 * (see UPGRADING/v0_16.md in stalwartlabs/stalwart). On the first start the script boots the
 * server in recovery mode, creates the listeners on unprivileged localhost ports, and then starts
 * it normally. The admin login comes from STALWART_RECOVERY_ADMIN (see crates/store/src/registry/local.rs).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { STALWART_ADMIN, STALWART_VERSION } from "./config";

const { values: args } = parseArgs({
  options: {
    instance: { type: "string", default: "stalwart" },
    http: { type: "string", default: "18080" },
    smtp: { type: "string", default: "10025" },
    imap: { type: "string", default: "10143" },
    fresh: { type: "boolean", default: false },
    seed: { type: "boolean", default: false },
  },
});

const root = resolve(import.meta.dir, "..");
const binDir = join(root, ".dev", "bin");
const binary = join(binDir, `stalwart-${STALWART_VERSION}`);
const instanceDir = join(root, ".dev", args.instance);
const configPath = join(instanceDir, "config.json");
const httpPort = Number(args.http);
const adminEnv = `${STALWART_ADMIN.user}:${STALWART_ADMIN.password}`;

const releaseTarget = (): string => {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  if (process.platform === "linux") return `${arch}-unknown-linux-gnu`;
  throw new Error(`No Stalwart build for ${process.platform}; use Linux, macOS or WSL.`);
};

const ensureBinary = async (): Promise<void> => {
  if (existsSync(binary)) return;
  await mkdir(binDir, { recursive: true });
  const url = `https://github.com/stalwartlabs/stalwart/releases/download/v${STALWART_VERSION}/stalwart-${releaseTarget()}.tar.gz`;
  console.log(`Downloading Stalwart ${STALWART_VERSION} …`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
  const archive = join(binDir, "stalwart.tar.gz");
  await Bun.write(archive, response);
  await run("tar", ["xzf", archive, "-C", binDir]);
  await Bun.write(binary, Bun.file(join(binDir, "stalwart")));
  await chmod(binary, 0o755);
  await rm(archive);
  await rm(join(binDir, "stalwart"));
};

const run = (cmd: string, cmdArgs: string[]): Promise<void> =>
  new Promise((ok, fail) => {
    const child = spawn(cmd, cmdArgs, { stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`${cmd} exited with ${code}`))));
  });

const startServer = (env: Record<string, string>) =>
  spawn(binary, ["--config", configPath], {
    cwd: instanceDir,
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, STALWART_RECOVERY_ADMIN: adminEnv, ...env },
  });

const waitForHttp = async (port: number): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/jmap/session`, {
        headers: { authorization: `Basic ${btoa(adminEnv)}` },
      });
      if (response.ok) return;
    } catch {
      // not up yet
    }
    await Bun.sleep(200);
  }
  throw new Error(`Stalwart did not answer on port ${port}`);
};

const createListeners = async (port: number): Promise<void> => {
  const listener = (name: string, protocol: string, listenPort: string) => ({
    name,
    protocol,
    bind: { [`127.0.0.1:${listenPort}`]: true },
    useTls: false,
  });
  const response = await fetch(`http://127.0.0.1:${port}/jmap/`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${btoa(adminEnv)}` },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      methodCalls: [
        [
          "x:NetworkListener/set",
          {
            create: {
              http: listener("http", "http", args.http),
              smtp: listener("smtp", "smtp", args.smtp),
              imap: listener("imap", "imap", args.imap),
            },
          },
          "0",
        ],
      ],
    }),
  });
  const body = await response.text();
  if (!response.ok || body.includes("notCreated"))
    throw new Error(`Listener setup failed: ${body}`);
};

const stop = (child: ReturnType<typeof spawn>): Promise<void> =>
  new Promise((ok) => {
    child.on("exit", () => ok());
    child.kill("SIGTERM");
  });

const firstStart = async (): Promise<void> => {
  await mkdir(join(instanceDir, "data"), { recursive: true });
  await writeFile(
    configPath,
    JSON.stringify({ "@type": "RocksDb", path: join(instanceDir, "data") }),
  );
  const recovery = startServer({
    STALWART_RECOVERY_MODE: "1",
    STALWART_RECOVERY_MODE_PORT: String(httpPort),
  });
  await waitForHttp(httpPort);
  await createListeners(httpPort);
  await stop(recovery);
};

const main = async (): Promise<void> => {
  await ensureBinary();
  if (args.fresh) await rm(instanceDir, { recursive: true, force: true });
  if (!existsSync(configPath)) await firstStart();

  const server = startServer({ STALWART_HOSTNAME: "localhost" });
  await waitForHttp(httpPort);
  console.log(
    `Stalwart ${STALWART_VERSION} läuft: http://127.0.0.1:${httpPort} (SMTP ${args.smtp}, IMAP ${args.imap}), Admin ${STALWART_ADMIN.user}`,
  );
  if (args.seed) {
    const { seed } = await import("./seed");
    console.log(await seed(`http://127.0.0.1:${httpPort}`));
  }
  const shutdown = () => server.kill("SIGTERM");
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.on("exit", (code) => process.exit(code ?? 0));
};

await main();
