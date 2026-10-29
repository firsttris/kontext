/**
 * `bun run dev`: everything for local development in one terminal, like `bun run dev` in
 * firsttris/stapel.
 *
 * 1. Stalwart on 18080 (dev/stalwart.ts), with the test data (the seed is idempotent, so it runs
 *    on every start). Its own log goes to .dev/stalwart.log to keep the terminal readable. If a
 *    Stalwart already answers on 18080 (`bun run dev:stalwart` in another terminal), that one is
 *    used.
 * 2. LiveKit for calls in the chat on 17880 (dev/livekit.ts), unless one already answers there.
 * 3. Once Stalwart is ready: the Kontext server (18090, restarts on changes) and the app (Vite,
 *    5173).
 * 4. Once the server answers: tasks and chat of the demo (dev/demo-data.ts), the first time only
 *    – they live in the server's database, which the Stalwart seed does not reach.
 *
 * Ctrl+C reaches all of them. When one exits, the others are stopped too, so a crash does not
 * leave a half-working setup behind.
 */
import type { Subprocess } from "bun";
import { fillDemo } from "./demo-data";

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

const livekitPort = 17880;

/** LiveKit is optional: without it everything works except calls. */
const livekit = async (): Promise<Subprocess[]> => {
  if (await isListening(`http://127.0.0.1:${livekitPort}/`)) return [];
  const child = Bun.spawn(["bun", "dev/livekit.ts"], { stdio: ["ignore", "inherit", "inherit"] });
  return [child];
};

const optional = await livekit();
const processes: Subprocess[] = [
  ...(await stalwart()),
  Bun.spawn(["bun", "--watch", "server/main.ts"], { stdio: ["ignore", "inherit", "inherit"] }),
  Bun.spawn(["bunx", "vite"], { stdio: ["inherit", "inherit", "inherit"] }),
];

const serverPort = 18090;

/** Waits for the Kontext server, then fills tasks and chat; a failure leaves the rest running. */
const demo = async () => {
  for (let tries = 0; tries < 120; tries++) {
    if (await isListening(`http://127.0.0.1:${serverPort}/healthz`)) break;
    await Bun.sleep(500);
  }
  try {
    const filled = await fillDemo(
      {
        app: `http://127.0.0.1:${serverPort}`,
        origin: "http://localhost:5173",
        stalwart: `http://127.0.0.1:${stalwartPort}`,
      },
      { once: true },
    );
    if (filled) console.log("Aufgaben und Chat der Testdaten angelegt.");
  } catch (error) {
    console.error("Aufgaben und Chat der Testdaten fehlen:", error);
  }
};
void demo();

const exitCode = await Promise.race(processes.map((child) => child.exited));
for (const child of [...processes, ...optional]) child.kill();
await Promise.all([...processes, ...optional].map((child) => child.exited));
process.exit(exitCode);
