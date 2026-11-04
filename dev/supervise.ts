/**
 * The processes of `bun run dev` (dev/dev.ts) and how they stop together: when one that the setup
 * needs exits, the others are stopped too, so a crash does not leave a half-working setup behind.
 *
 * Each process runs detached, in a process group of its own, and is stopped as a group: what it
 * started stops with it (Vite under bunx, the Stalwart and LiveKit binaries under dev/stalwart.ts
 * and dev/livekit.ts). A process group of their own also keeps Ctrl+C from reaching them directly,
 * so dev.ts passes on SIGINT, SIGTERM (an IDE's stop, `kill`) and SIGHUP (the terminal closed)
 * itself, then waits until all have exited (as in firsttris/ccu-addon-mui scripts/dev.ts), and
 * Ctrl+Z and `fg` as well.
 */

import { constants } from "node:os";
import type { SpawnOptions, Subprocess } from "bun";

type Child = { subprocess: Subprocess; required: boolean };
type Options = SpawnOptions.OptionsObject<"ignore" | "inherit", "inherit", "inherit">;

const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
type Signal = (typeof SIGNALS)[number];

/** The exit code of a process ended by a signal, as a shell reports it. */
const signalCode = (signal: Signal) => 128 + constants.signals[signal];

const signalGroup = ({ subprocess }: Child, signal: Signal | "SIGSTOP" | "SIGCONT") => {
  try {
    process.kill(-subprocess.pid, signal);
  } catch {
    // the whole group has exited already
  }
};

export const supervise = () => {
  const children: Child[] = [];
  let received: Signal | undefined;

  const signalled = new Promise<Signal>((done) => {
    for (const signal of SIGNALS)
      process.on(signal, () => {
        received ??= signal;
        for (const child of children) signalGroup(child, signal);
        done(signal);
      });
  });

  // Ctrl+Z (SIGTSTP) reaches only dev.ts, the processes' sessions are out of the terminal's reach:
  // stop them too, or Vite keeps reading the terminal the shell has taken back. SIGSTOP, as the
  // kernel drops SIGTSTP sent to an orphaned group (a session of its own is one); `fg` (SIGCONT)
  // lets them go on. As in firsttris/haul scripts/dev.ts.
  process.on("SIGTSTP", () => {
    for (const child of children) signalGroup(child, "SIGSTOP");
    process.kill(process.pid, "SIGSTOP");
  });
  process.on("SIGCONT", () => {
    for (const child of children) signalGroup(child, "SIGCONT");
  });

  const spawn =
    (required: boolean) =>
    (cmd: string[], options: Options): Subprocess => {
      const child = { subprocess: Bun.spawn(cmd, { ...options, detached: true }), required };
      children.push(child);
      // Started while dev.ts is being stopped (Stalwart after the LiveKit check): stop it too.
      if (received) signalGroup(child, received);
      return child.subprocess;
    };

  /**
   * Stops every process with what it started and resolves, once all have exited, with `code`, or
   * with 128 + n after signal n.
   */
  const shutdown = async (code: number): Promise<number> => {
    if (!received) for (const child of children) signalGroup(child, "SIGTERM");
    await Promise.all(children.map((child) => child.subprocess.exited));
    return received ? signalCode(received) : code;
  };

  /** Waits for a signal or for a required process to exit, then stops the rest (`shutdown`). */
  const run = async (): Promise<number> => {
    const required = children.filter((child) => child.required);
    const code = await Promise.race([
      signalled.then(signalCode),
      ...required.map((child) => child.subprocess.exited),
    ]);
    return shutdown(code);
  };

  return {
    /** Starts a process the setup needs: when it exits, the others are stopped. */
    start: spawn(true),
    /** Starts a process the setup can do without (LiveKit): when it exits, nothing else stops. */
    startOptional: spawn(false),
    run,
    shutdown,
  };
};
