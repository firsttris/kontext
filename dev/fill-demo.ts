/**
 * `bun run dev:demo`, part of `bun run dev`: tasks and chat of the demo (dev/demo-data.ts), the
 * first time only – they live in the server's database, which the Stalwart seed does not reach.
 *
 * `bun run dev` starts everything side by side, so this waits until the seed is in Stalwart and
 * the Kontext server answers, fills once and exits; the others keep running (`bun run --parallel`
 * stops them only when a script fails). A failure is reported and leaves the rest running too.
 */
import { fillDemo, seedIsIn } from "./demo-data";

const stalwart = "http://127.0.0.1:18080";
const server = "http://127.0.0.1:18090";

const answers = async (url: string): Promise<boolean> => {
  try {
    return (await fetch(url)).ok;
  } catch {
    return false;
  }
};

/** Polls until `ready` holds; Stalwart's first start includes its download, so without a limit. */
const until = async (ready: () => Promise<boolean>): Promise<void> => {
  while (!(await ready())) await Bun.sleep(1000);
};

await until(() => seedIsIn(stalwart));
await until(() => answers(`${server}/healthz`));
try {
  const filled = await fillDemo(
    { app: server, origin: "http://localhost:5173", stalwart },
    { once: true },
  );
  console.log(filled ? "Aufgaben und Chat der Testdaten angelegt." : "Aufgaben und Chat sind da.");
} catch (error) {
  console.error("Aufgaben und Chat der Testdaten fehlen:", error);
}
