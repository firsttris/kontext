/**
 * The telephone box's agent, next to Asterisk in the same container (host network).
 *
 *   KONTEXT_URL=https://kontext.firma.de PAIRING_CODE=K7QM-4XPA bun box/agent/main.ts
 *
 * Pairs once (or through the status page on :8089) and keeps the token in DATA_DIR, writes
 * Asterisk's configuration into ASTERISK_CONFIG_DIR whenever Kontext sends one, and talks to
 * Asterisk over AMI on localhost.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BoxConfig } from "../../server/phone/protocol";
import { createBoxFiles } from "./files";
import { type Credentials, pair } from "./link";
import { createAsterisk } from "./pbx";
import { type BoxState, runBox } from "./run";
import { statusPage } from "./status-page";

const VERSION = process.env.BOX_VERSION ?? "dev";
const DATA_DIR = process.env.DATA_DIR ?? "/data";
const CONFIG_DIR = process.env.ASTERISK_CONFIG_DIR ?? "/etc/asterisk";
const STATUS_PORT = Number(process.env.STATUS_PORT ?? 8089);
const AMI = {
  username: "kontext-agent",
  secret: process.env.AMI_SECRET ?? "",
  port: Number(process.env.AMI_PORT ?? 5038),
};
const PATHS = { sounds: join(DATA_DIR, "sounds"), recordings: join(DATA_DIR, "recordings") };
const credentialsFile = join(DATA_DIR, "kontext.json");
const configFile = join(DATA_DIR, "config.json");

const loadCredentials = async (): Promise<Credentials | null> =>
  existsSync(credentialsFile)
    ? (JSON.parse(await readFile(credentialsFile, "utf8")) as Credentials)
    : null;

const saveCredentials = async (credentials: Credentials) => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(credentialsFile, JSON.stringify(credentials), { mode: 0o600 });
};

let credentials = await loadCredentials();
let state: (() => BoxState) | null = null;
let pairingError: string | undefined;

const start = async (paired: Credentials) => {
  const box = await runBox({
    credentials: paired,
    version: VERSION,
    makePbx: (events) =>
      createAsterisk({
        configDir: CONFIG_DIR,
        paths: PATHS,
        files: createBoxFiles({ credentials: paired, soundDir: PATHS.sounds }),
        ami: AMI,
        events,
      }),
    lastConfig: existsSync(configFile)
      ? (JSON.parse(await readFile(configFile, "utf8")) as BoxConfig)
      : null,
    remember: (config) => writeFile(configFile, JSON.stringify(config), { mode: 0o600 }),
  });
  state = box.state;
};

const pairWith = async (url: string, code: string) => {
  credentials = await pair(url, code);
  await saveCredentials(credentials);
  await start(credentials);
};

if (!AMI.secret) throw new Error("AMI_SECRET fehlt");
if (credentials) await start(credentials);
else if (process.env.KONTEXT_URL && process.env.PAIRING_CODE) {
  await pairWith(process.env.KONTEXT_URL, process.env.PAIRING_CODE).catch((error: Error) => {
    pairingError = error.message;
  });
}

Bun.serve({
  port: STATUS_PORT,
  fetch: async (request) => {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/pair" && !credentials) {
      const form = await request.formData();
      pairingError = undefined;
      await pairWith(String(form.get("url") ?? ""), String(form.get("code") ?? "")).catch(
        (error: Error) => {
          pairingError = error.message;
        },
      );
      return Response.redirect("/", 303);
    }
    const html = statusPage({
      version: VERSION,
      paired: Boolean(credentials),
      kontextUrl: credentials?.url ?? null,
      state: state?.() ?? null,
      error: pairingError,
    });
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
  },
});
console.log(`Kontext-Telefonbox ${VERSION}: Status auf http://0.0.0.0:${STATUS_PORT}`);
