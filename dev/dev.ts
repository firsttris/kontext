/**
 * `bun run dev`: everything for local development in one terminal, like `bun run dev` in
 * firsttris/stapel.
 *
 * 1. Stalwart on 18080 (dev/stalwart.ts), with the test data (the seed is idempotent, so it runs
 *    on every start). Its own log goes to .dev/stalwart.log to keep the terminal readable. If a
 *    Stalwart already answers on 18080 (`bun run dev:stalwart` in another terminal), that one is
 *    used.
 * 2. Once Stalwart is ready: the Kontext server (18090, restarts on changes) and the app (Vite,
 *    5173).
 *
 * Ctrl+C reaches all of them. When one exits, the others are stopped too, so a crash does not
 * leave a half-working setup behind.
 */
import type { Subprocess } from "bun";

const stalwartPort = 18080;
const stalwartLog = ".dev/stalwart.log";

const isListening = async (url: string): Promise<boolean> => {
  try {
    await fetch(url);
    return true;
  } catch {
    return false;
  }
};

/** Resolves once Stalwart answers and the seed is in (dev/stalwart.ts sends "ready" over IPC). */
const startStalwart = (): Promise<Subprocess> =>
  new Promise((ready, fail) => {
    const child = Bun.spawn(["bun", "dev/stalwart.ts", "--seed", "--log", stalwartLog], {
      stdio: ["ignore", "inherit", "inherit"],
      ipc: (message) => {
        if (message === "ready") ready(child);
      },
    });
    child.exited.then((code) => fail(new Error(`Stalwart stopped (${code}), see ${stalwartLog}`)));
  });

const stalwart = async (): Promise<Subprocess[]> => {
  if (await isListening(`http://127.0.0.1:${stalwartPort}/`)) {
    console.log(`Stalwart läuft schon auf ${stalwartPort}, wird mitbenutzt.`);
    return [];
  }
  const child = await startStalwart();
  console.log(`Stalwart-Log: ${stalwartLog}`);
  return [child];
};

const processes: Subprocess[] = [
  ...(await stalwart()),
  Bun.spawn(["bun", "--watch", "server/main.ts"], { stdio: ["ignore", "inherit", "inherit"] }),
  Bun.spawn(["bunx", "vite"], { stdio: ["inherit", "inherit", "inherit"] }),
];

const exitCode = await Promise.race(processes.map((child) => child.exited));
for (const child of processes) child.kill();
await Promise.all(processes.map((child) => child.exited));
process.exit(exitCode);
