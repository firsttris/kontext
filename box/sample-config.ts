/**
 * Writes Asterisk's files for a configuration with every feature on, so CI can check that the
 * box's Asterisk reads all of it (.github/workflows/ci.yml, job "box").
 *
 *   bun box/sample-config.ts <dir>
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BoxConfig } from "../server/phone/protocol";
import { extensionsConf, pjsipConf } from "./agent/asterisk-config";

const sound = "a1b2c3d4e5f6a1b2c3d4e5f6";

export const sampleConfig: BoxConfig = {
  line: { registrar: "fritz.box", username: "kontext620", password: "geheim" },
  extraLines: [{ id: "anna", username: "kontext621", password: "zwei" }],
  trunk: { host: "kontext.firma.de", port: 5060, username: "kontext-box", password: "trunk" },
  ringSeconds: 25,
  sounds: [sound],
  mailbox: { greeting: sound, maxSeconds: 120 },
  hours: {
    timezone: "Europe/Berlin",
    open: [
      { day: 1, from: "08:00", to: "12:00" },
      { day: 1, from: "13:00", to: "17:00" },
    ],
    closedDays: ["2026-12-24"],
    greeting: sound,
  },
  forward: { number: "01712345678", afterSeconds: 10 },
};

const dir = process.argv[2] ?? ".box-sample";
await mkdir(dir, { recursive: true });
const paths = { sounds: "/data/sounds", recordings: "/data/recordings" };
await writeFile(join(dir, "pjsip.conf"), pjsipConf(sampleConfig));
await writeFile(join(dir, "extensions.conf"), extensionsConf(sampleConfig, paths));
console.log(`Asterisk-Dateien in ${dir}`);
