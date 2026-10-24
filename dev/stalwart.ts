/**
 * Runs a local Stalwart mail server for development and tests.
 *
 *   bun dev/stalwart.ts                 # dev instance, data in .dev/stalwart, HTTP on 18080
 *   bun dev/stalwart.ts --fresh         # wipe the dev data first
 *   bun dev/stalwart.ts --seed          # and fill it with the test data
 *   bun dev/stalwart.ts --instance e2e --http 28080 --smtp 20025 --imap 20143 --fresh --seed
 *   bun dev/stalwart.ts --seed --log .dev/stalwart.log   # server log into a file (bun run dev)
 *
 * Started by another process with IPC (dev/dev.ts), it sends "ready" once the server answers and
 * the seed is in.
 *
 * Stalwart 0.16 keeps all settings in its database, only the datastore is in config.json
 * (see UPGRADING/v0_16.md in stalwartlabs/stalwart). On the first start the script boots the
 * server in recovery mode, creates the listeners on unprivileged localhost ports, and then starts
 * it normally. The admin login comes from STALWART_RECOVERY_ADMIN (see crates/store/src/registry/local.rs).
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { STALWART_ADMIN, STALWART_VERSION } from "./config";
import { download } from "./download";

const { values: args } = parseArgs({
  options: {
    instance: { type: "string", default: "stalwart" },
    http: { type: "string", default: "18080" },
    smtp: { type: "string", default: "10025" },
    imap: { type: "string", default: "10143" },
    fresh: { type: "boolean", default: false },
    seed: { type: "boolean", default: false },
    log: { type: "string" },
  },
});

const root = resolve(import.meta.dir, "..");
const binDir = join(root, ".dev", "bin");
const binary = join(binDir, `stalwart-${STALWART_VERSION}`);
const instanceDir = join(root, ".dev", args.instance);
const configPath = join(instanceDir, "config.json");
const httpPort = Number(args.http);
const adminEnv = `${STALWART_ADMIN.user}:${STALWART_ADMIN.password}`;

/** Where the server's own log goes: the terminal, or a file with --log. */
const serverOutput = (): "inherit" | number => {
  if (!args.log) return "inherit";
  const path = resolve(args.log);
  mkdirSync(dirname(path), { recursive: true });
  return openSync(path, "a");
};

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
  const archive = join(binDir, "stalwart.tar.gz");
  await download(url, archive, `Downloading Stalwart ${STALWART_VERSION}`);
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

const startServer = (env: Record<string, string>) => {
  const output = serverOutput();
  return spawn(binary, ["--config", configPath], {
    cwd: instanceDir,
    stdio: ["ignore", output, output],
    env: { ...process.env, STALWART_RECOVERY_ADMIN: adminEnv, ...env },
  });
};

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

type Invocation = [string, Record<string, unknown>, string];

/** Management calls as the admin (crates/registry/src/schema/structs.rs, as x:<Object>/get|set). */
const adminRequest = async (port: number, methodCalls: Invocation[]): Promise<Invocation[]> => {
  const response = await fetch(`http://127.0.0.1:${port}/jmap/`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Basic ${btoa(adminEnv)}` },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", "urn:stalwart:jmap"],
      methodCalls,
    }),
  });
  const body = await response.text();
  if (!response.ok || /"(error|notCreated|notUpdated)"/.test(body))
    throw new Error(`Stalwart setup failed: ${body}`);
  return (JSON.parse(body) as { methodResponses: Invocation[] }).methodResponses;
};

const createListeners = async (port: number): Promise<void> => {
  const listener = (name: string, protocol: string, listenPort: string) => ({
    name,
    protocol,
    bind: { [`127.0.0.1:${listenPort}`]: true },
    useTls: false,
  });
  await adminRequest(port, [
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
    // The dev listeners have no TLS; let IMAP clients (and the integration tests) log in
    // anyway. Only for this local instance on 127.0.0.1.
    ["x:Imap/set", { update: { singleton: { allowPlainTextAuth: true } } }, "1"],
    // German stemming for the search index and for searches (see docs/installation.md).
    ["x:Search/set", { update: { singleton: { defaultLanguage: "de-DE" } } }, "2"],
    // Stalwart allows 4 requests at a time per person (crates/registry/src/schema/structs_impl.rs),
    // shared by all their tabs and devices; the app asks more on start (see docs/installation.md).
    ["x:Jmap/set", { update: { singleton: { maxConcurrentRequests: 16 } } }, "3"],
  ]);
};

/**
 * Stalwart treats port 25 as mail from the internet: no login, SPF, DKIM, DMARC and reverse DNS
 * checked, Authentication-Results and Received-SPF written. Its defaults say so as
 * `local_port == 25` (crates/registry/src/schema/structs_impl.rs). The dev SMTP port cannot be 25,
 * so these rules are read and widened to it; mail sent to it then looks like mail from outside,
 * which the sender check in the reading pane needs. The spam filter (on for every session without
 * login) is turned off there: it would put every mail from a .test domain into Spam and asks
 * blocklists on the internet. Runs on every start and changes each rule once.
 */
type Expression = { match: Record<string, { if: string; then: string }>; else: string };
type Rewrite = (expression: Expression, smtpPort: string) => Expression;

const widenPort25: Rewrite = (expression, smtpPort) =>
  JSON.parse(
    JSON.stringify(expression)
      .replaceAll("local_port == 25", `(local_port == 25 || local_port == ${smtpPort})`)
      .replaceAll("local_port != 25", `(local_port != 25 && local_port != ${smtpPort})`),
  );

const notOnDevPort: Rewrite = (expression, smtpPort) => {
  const off = (value: string) => `(${value}) && local_port != ${smtpPort}`;
  return {
    match: Object.fromEntries(
      Object.entries(expression.match).map(([key, rule]) => [
        key,
        // biome-ignore lint/suspicious/noThenProperty: Stalwart's ExpressionMatch has "if" and "then".
        { ...rule, then: off(rule.then) },
      ]),
    ),
    else: off(expression.else),
  };
};

const INBOUND_RULES: Record<string, Record<string, Rewrite>> = {
  MtaStageAuth: { require: widenPort25 },
  MtaStageData: {
    addAuthResultsHeader: widenPort25,
    addReceivedSpfHeader: widenPort25,
    addReceivedHeader: widenPort25,
    addReturnPathHeader: widenPort25,
    enableSpamFilter: notOnDevPort,
  },
  SenderAuth: {
    spfEhloVerify: widenPort25,
    spfFromVerify: widenPort25,
    dmarcVerify: widenPort25,
    reverseIpVerify: widenPort25,
  },
};

const treatSmtpAsInbound = async (port: number, smtpPort: string): Promise<void> => {
  const objects = Object.entries(INBOUND_RULES);
  const current = await adminRequest(
    port,
    objects.map(([object, rules], index) => [
      `x:${object}/get`,
      { ids: ["singleton"], properties: Object.keys(rules) },
      String(index),
    ]),
  );
  const updates = objects.flatMap(([object, rules], index): Invocation[] => {
    const [settings = {}] = (current[index]![1].list ?? []) as Record<string, Expression>[];
    const changed = Object.fromEntries(
      Object.entries(rules)
        .filter(([property]) => !JSON.stringify(settings[property]).includes(`= ${smtpPort}`))
        .map(([property, rewrite]) => [property, rewrite(settings[property]!, smtpPort)]),
    );
    return Object.keys(changed).length
      ? [[`x:${object}/set`, { update: { singleton: changed } }, String(index)]]
      : [];
  });
  if (updates.length) await adminRequest(port, updates);
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
  await treatSmtpAsInbound(httpPort, args.smtp);
  console.log(
    `Stalwart ${STALWART_VERSION} läuft: http://127.0.0.1:${httpPort} (SMTP ${args.smtp}, IMAP ${args.imap}), Admin ${STALWART_ADMIN.user}`,
  );
  if (args.seed) {
    const { seed } = await import("./seed");
    console.log(await seed(`http://127.0.0.1:${httpPort}`));
  }
  process.send?.("ready");
  const shutdown = () => server.kill("SIGTERM");
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  server.on("exit", (code) => process.exit(code ?? 0));
};

await main();
