/**
 * Runs a local LiveKit for calls in the chat (development and tests).
 *
 *   bun dev/livekit.ts                                     # 17880, webhooks to the server on 18090
 *   bun dev/livekit.ts --port 27880 --server 28090         # the e2e instance
 *
 * On Linux the release binary is downloaded into .dev/bin (only Linux and Windows builds are
 * published, livekit/livekit .goreleaser.yaml); elsewhere a `livekit-server` on the PATH is used
 * (macOS: `brew install livekit`). It listens on 127.0.0.1 only: signalling on --port, media over
 * TCP on port+1 and UDP on port+2. The browser reaches the signalling through Vite (/rtc).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { chmod, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { LIVEKIT_DEV_KEY, LIVEKIT_VERSION } from "./config";
import { download } from "./download";

const { values: args } = parseArgs({
  options: {
    port: { type: "string", default: "17880" },
    server: { type: "string", default: "18090" },
  },
});

const root = resolve(import.meta.dir, "..");
const binDir = join(root, ".dev", "bin");
const port = Number(args.port);

/** The config as LiveKit reads it from LIVEKIT_CONFIG (livekit/livekit config-sample.yaml). */
export const devConfig = (signalPort: number, serverPort: number): string =>
  JSON.stringify({
    port: signalPort,
    rtc: { tcp_port: signalPort + 1, use_external_ip: false },
    keys: { [LIVEKIT_DEV_KEY.key]: LIVEKIT_DEV_KEY.secret },
    webhook: {
      api_key: LIVEKIT_DEV_KEY.key,
      urls: [`http://127.0.0.1:${serverPort}/api/calls/webhook`],
    },
    // An unanswered call should not keep its room long.
    room: { empty_timeout: 60, departure_timeout: 5 },
    logging: { level: "warn" },
  });

const releaseArch = () => (process.arch === "arm64" ? "arm64" : "amd64");

/** The binary to start: the downloaded release on Linux, else the one on the PATH. */
const ensureBinary = async (): Promise<string> => {
  if (process.platform !== "linux") {
    const found = Bun.which("livekit-server");
    if (!found) throw new Error("livekit-server fehlt: unter macOS `brew install livekit`.");
    return found;
  }
  const binary = join(binDir, `livekit-server-${LIVEKIT_VERSION}`);
  if (existsSync(binary)) return binary;
  await mkdir(binDir, { recursive: true });
  const name = `livekit_${LIVEKIT_VERSION}_linux_${releaseArch()}.tar.gz`;
  const url = `https://github.com/livekit/livekit/releases/download/v${LIVEKIT_VERSION}/${name}`;
  const archive = join(binDir, name);
  await download(url, archive, `Downloading LiveKit ${LIVEKIT_VERSION}`);
  const unpacked = Bun.spawnSync(["tar", "xzf", archive, "-C", binDir, "livekit-server"]);
  if (unpacked.exitCode !== 0) throw new Error(`tar: ${unpacked.stderr}`);
  await Bun.write(binary, Bun.file(join(binDir, "livekit-server")));
  await chmod(binary, 0o755);
  await rm(archive);
  await rm(join(binDir, "livekit-server"));
  return binary;
};

const waitForHttp = async (): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/`);
      return;
    } catch {
      await Bun.sleep(200);
    }
  }
  throw new Error(`LiveKit did not answer on port ${port}`);
};

if (import.meta.main) {
  const binary = await ensureBinary();
  // The UDP port as a flag: the config's udp_port is a range type (cmd/server/main.go "udp-port").
  const server = spawn(binary, ["--bind", "127.0.0.1", "--dev", "--udp-port", String(port + 2)], {
    stdio: ["ignore", "inherit", "inherit"],
    env: { ...process.env, LIVEKIT_CONFIG: devConfig(port, Number(args.server)) },
  });
  await waitForHttp();
  console.log(`LiveKit ${LIVEKIT_VERSION} bereit: http://127.0.0.1:${port}`);
  process.send?.("ready");
  const shutdown = () => server.kill("SIGTERM");
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.on("exit", (code) => process.exit(code ?? 0));
}
