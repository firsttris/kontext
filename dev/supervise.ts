/**
 * The processes of `bun run dev` (dev/dev.ts) and how they stop together: when one that the setup
 * needs exits, the others are stopped too, so a crash does not leave a half-working setup behind.
 */
import type { SpawnOptions, Subprocess } from "bun";

type Child = { process: Subprocess; required: boolean };
type Options = SpawnOptions.OptionsObject<"ignore" | "inherit", "inherit", "inherit">;

export const supervise = () => {
  const children: Child[] = [];

  const spawn =
    (required: boolean) =>
    (cmd: string[], options: Options): Subprocess => {
      const process = Bun.spawn(cmd, options);
      children.push({ process, required });
      return process;
    };

  /** Waits until a required process exits, stops the rest and resolves with its exit code. */
  const run = async (): Promise<number> => {
    const required = children.filter((child) => child.required);
    const code = await Promise.race(required.map((child) => child.process.exited));
    for (const child of children) child.process.kill();
    await Promise.all(children.map((child) => child.process.exited));
    return code;
  };

  return {
    /** Starts a process the setup needs: when it exits, the others are stopped. */
    start: spawn(true),
    /** Starts a process the setup can do without (LiveKit): when it exits, nothing else stops. */
    startOptional: spawn(false),
    run,
  };
};
