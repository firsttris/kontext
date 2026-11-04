/**
 * Sets up what Kontext needs in Stalwart; safe to run again after every update.
 *
 *   docker compose -f deploy/compose.yaml exec kontext bun server/setup-stalwart.ts
 *   podman exec -it kontext bun server/setup-stalwart.ts            # Quadlet
 *   … bun server/setup-stalwart.ts --domain firma.de                # with several domains
 *
 * Asks for Stalwart's admin login (or takes it from STALWART_ADMIN="name:password"); it is only
 * held in memory, never written or printed. Reaches Stalwart at STALWART_URL (the container's,
 * http://stalwart:8080). Prints the new API key once, as the line for deploy/.env.
 * What it does: server/stalwart-setup.ts.
 */
import { parseArgs } from "node:util";
import type { Result } from "./company/accounts";
import { createRequest } from "./company/management";
import {
  ensureDirectoryQueries,
  ensureOAuthClient,
  ensureRole,
  ensureServerAccount,
  envLine,
} from "./stalwart-setup";

const { values: args } = parseArgs({ options: { domain: { type: "string" } } });
const stalwartUrl = process.env.STALWART_URL ?? "http://127.0.0.1:8080";

/** One line from the terminal; with `hidden` nothing is echoed (raw mode). */
const ask = (question: string, hidden: boolean): Promise<string> =>
  new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    let text = "";
    const onData = (chunk: Buffer) => {
      for (const char of chunk.toString("utf8")) {
        if (char === "\u0003") {
          stdin.setRawMode(false);
          process.exit(130);
        }
        if (char === "\r" || char === "\n") {
          stdin.off("data", onData);
          stdin.setRawMode(false);
          stdin.pause();
          process.stdout.write("\n");
          return resolve(text);
        }
        if (char === "\u007f" || char === "\b") {
          if (text && !hidden) process.stdout.write("\b \b");
          text = text.slice(0, -1);
        } else {
          text += char;
          if (!hidden) process.stdout.write(char);
        }
      }
    };
    stdin.on("data", onData);
  });

const adminLogin = async (): Promise<Result<string>> => {
  const fromEnv = process.env.STALWART_ADMIN;
  if (fromEnv) return { ok: true, value: fromEnv };
  if (!process.stdin.isTTY)
    return {
      ok: false,
      error: "Kein Terminal: den Stalwart-Admin als STALWART_ADMIN=name:passwort übergeben.",
    };
  const name = await ask("Stalwart-Admin (z. B. admin@firma.de): ", false);
  const password = await ask("Passwort: ", true);
  return { ok: true, value: `${name.trim()}:${password}` };
};

const randomPassword = (): string =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");

/** A thrown error (Stalwart unreachable, a refused login) as a value, in words for the admin. */
const attempt = async <T>(step: () => Promise<Result<T>>): Promise<Result<T>> =>
  step().catch((error: Error) => ({
    ok: false as const,
    error: / 401$/.test(error.message)
      ? `Stalwart lehnt die Anmeldung ab (${error.message}); Admin-Name und Passwort prüfen.`
      : `Stalwart unter ${stalwartUrl}: ${error.message}`,
  }));

const main = async (): Promise<number> => {
  const login = await adminLogin();
  if (!login.ok) return report(login.error);
  const request = createRequest(stalwartUrl, login.value);
  const asAccount = (name: string, password: string) =>
    createRequest(stalwartUrl, `${name}:${password}`);

  for (const step of [ensureOAuthClient, ensureDirectoryQueries]) {
    const result = await attempt(() => step(request));
    if (!result.ok) return report(result.error);
    console.log(result.value);
  }
  const role = await attempt(() => ensureRole(request));
  if (!role.ok) return report(role.error);
  console.log(role.value.message);
  const account = await attempt(() =>
    ensureServerAccount(request, asAccount, {
      roleId: role.value.id,
      domain: args.domain,
      newPassword: randomPassword,
    }),
  );
  if (!account.ok) return report(account.error);
  for (const message of account.value.messages) console.log(message);
  if (account.value.key) {
    console.log(
      "\nDen Schlüssel zeigt Stalwart nur jetzt. In deploy/.env eintragen (Quadlet: deploy/kontext.env)",
    );
    console.log("und Kontext neu starten (docker compose -f deploy/compose.yaml up -d):\n");
    console.log(envLine(account.value.key));
  }
  console.log("\nStalwart ist für Kontext eingerichtet.");
  return 0;
};

const report = (error: string): number => {
  console.error(`Fehler: ${error}`);
  return 1;
};

process.exit(await main());
