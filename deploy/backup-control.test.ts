// @vitest-environment node
/**
 * deploy/backup-control.sh with stand-ins for systemctl and podman: what it takes from Kontext's
 * files, what it writes into the timer and back into the volume.
 */
import { spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const roots: string[] = [];

/** `backup` is the stand-in for backup.sh; null takes the real one (for its lock). */
const setup = (
  backup: string | null = 'echo "$(date -Is) backup size: 838860 bytes"\necho "backup ok"',
) => {
  const root = mkdtempSync(join(tmpdir(), "backup-control-"));
  roots.push(root);
  const bin = join(root, "bin");
  const deploy = join(root, "deploy");
  const volume = join(root, "volumes", "kontext_kontext-data");
  const units = join(root, "units");
  const calls = join(root, "calls");
  for (const dir of [bin, deploy, volume, units]) mkdirSync(dir, { recursive: true });
  const script = (path: string, body: string) => {
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  };
  // Compose without Docker: the volume through podman, named with the project's prefix.
  script(
    join(bin, "podman"),
    `for last; do :; done; [ -d "${root}/volumes/$last" ] && echo "${root}/volumes/$last"`,
  );
  script(join(bin, "docker"), "exit 1");
  script(
    join(bin, "systemctl"),
    `echo "$*" >> "${calls}"
case "$1 $2" in
  "is-enabled --quiet" | "is-active --quiet") [ -f "${root}/enabled" ] ;;
  "is-active kontext-backup.service") echo inactive; exit 3 ;;
  "enable --now") touch "${root}/enabled" ;;
  "disable --now") rm -f "${root}/enabled" ;;
  "show kontext-backup.timer") echo "@1793156400" ;;
esac`,
  );
  for (const name of ["backup-control.sh", "backup-host.sh", "backup.sh", "systemd"]) {
    cpSync(join(import.meta.dirname, name), join(deploy, name), { recursive: true });
  }
  if (backup !== null) script(join(deploy, "backup.sh"), backup);
  writeFileSync(
    join(deploy, ".env"),
    "RESTIC_REPOSITORY=s3:https://abc.eu.r2.cloudflarestorage.com/kontext-firma\nRESTIC_PASSWORD=geheim\n",
  );
  const control = join(volume, "backup-control");
  const lock = join(root, "backup.lock");
  const env = {
    ...process.env,
    PATH: `${bin}:${process.env.PATH}`,
    KONTEXT_BACKUP_STATE: join(root, "state"),
    KONTEXT_BACKUP_UNITS: units,
    KONTEXT_BACKUP_LOCK: lock,
  };
  const run = (command: string) =>
    spawnSync(join(deploy, "backup-control.sh"), [command], { encoding: "utf8", env });
  const kontextWrites = (name: string, content: string) =>
    writeFileSync(join(control, name), content);
  const status = () => JSON.parse(readFileSync(join(control, "status.json"), "utf8"));
  const timeConf = () => readFileSync(join(units, "kontext-backup.timer.d", "time.conf"), "utf8");
  const systemctl = () => readFileSync(calls, "utf8");
  /** Kontext (owner of the volume) swaps the control directory for a link to `outside`. */
  const swapCommand = (outside: string) =>
    `if [ ! -L "${control}" ]; then mv "${control}" "${control}.old"; ln -s "${outside}" "${control}"; fi`;
  return {
    root,
    bin,
    deploy,
    control,
    units,
    lock,
    env,
    script,
    swapCommand,
    run,
    kontextWrites,
    status,
    timeConf,
    systemctl,
  };
};

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("backup-control.sh", () => {
  it("installs the units with the paths filled in and writes a first status", () => {
    const { run, units, control, status } = setup();
    expect(run("install").status).toBe(0);
    const path = readFileSync(join(units, "kontext-backup-control.path"), "utf8");
    expect(path).toContain(`PathChanged=${control}/settings.json`);
    expect(path).toContain(`PathExists=${control}/run-now`);
    expect(readFileSync(join(units, "kontext-backup.service"), "utf8")).not.toContain("@DEPLOY@");
    expect(status()).toMatchObject({
      state: "idle",
      lastRun: null,
      target: "Cloudflare R2 (kontext-firma)",
      schedule: { enabled: false, time: "03:00" },
    });
    // Nothing secret goes into the volume.
    expect(readFileSync(join(control, "status.json"), "utf8")).not.toContain("geheim");
  });

  it("puts a checked time into the timer and switches it on and off", () => {
    const { run, kontextWrites, timeConf, status, systemctl } = setup();
    run("install");
    kontextWrites("settings.json", '{"enabled":true,"time":"04:30"}');
    expect(run("apply").status).toBe(0);
    expect(timeConf()).toBe("[Timer]\nOnCalendar=\nOnCalendar=*-*-* 04:30:00 Europe/Berlin\n");
    expect(systemctl()).toContain("enable --now kontext-backup.timer");
    expect(status()).toMatchObject({
      schedule: { enabled: true, time: "04:30" },
      nextRun: "2026-10-28T03:00:00Z",
    });

    kontextWrites("settings.json", '{"enabled":false,"time":"04:30"}');
    run("apply");
    expect(systemctl()).toContain("disable --now kontext-backup.timer");
    expect(status().schedule.enabled).toBe(false);
  });

  it("takes the next run from the calendar while the timer's own run is on", () => {
    const { bin, run, kontextWrites, status, script } = setup();
    run("install");
    kontextWrites("settings.json", '{"enabled":true,"time":"04:30"}');
    run("apply");
    // During a run the timer started, systemd shows no next elapse yet.
    const stand = readFileSync(join(bin, "systemctl"), "utf8").replace("#!/bin/sh\n", "");
    script(join(bin, "systemctl"), `[ "$1" = show ] && exit 0\n${stand}`);
    script(
      join(bin, "systemd-analyze"),
      `[ "$2" = "*-*-* 04:30:00 Europe/Berlin" ] && echo "       (in UTC): Thu 2026-10-29 03:30:00 UTC"`,
    );
    run("finish");
    expect(status().nextRun).toBe("2026-10-29T03:30:00Z");
  });

  it("ignores a time that is not exactly HH:MM", () => {
    const { root, run, kontextWrites, timeConf } = setup();
    run("install");
    kontextWrites("settings.json", '{"enabled":true,"time":"05:00"}');
    run("apply");
    for (const time of ["05:00\\nOnCalendar=*", "$(touch pwned)", "`touch pwned`", "25:00"]) {
      kontextWrites("settings.json", `{"enabled":true,"time":"${time}"}`);
      expect(run("apply").status).toBe(0);
      expect(timeConf()).toContain("OnCalendar=*-*-* 05:00:00 Europe/Berlin\n");
    }
    expect(spawnSync("ls", [root]).stdout.toString()).not.toContain("pwned");
  });

  it("starts a run asked for, and reports how it went with the log", () => {
    const { run, kontextWrites, control, status, systemctl } = setup();
    run("install");
    kontextWrites("run-now", "");
    run("apply");
    expect(systemctl()).toContain("start --no-block kontext-backup.service");
    expect(spawnSync("ls", [control]).stdout.toString()).not.toContain("run-now");

    expect(run("run").status).toBe(0);
    expect(status()).toMatchObject({
      state: "idle",
      sizeBytes: 838860,
      warnGb: 8,
      lastRun: { ok: true, message: "backup ok" },
    });
    expect(readFileSync(join(control, "log.txt"), "utf8")).toContain("backup ok");
  });

  it("reports a failed run with its last line", () => {
    const { run, status } = setup('echo "Fatal: unable to open repository" >&2\nexit 1');
    run("install");
    run("run");
    expect(status().lastRun).toMatchObject({
      ok: false,
      message: "Fatal: unable to open repository",
    });
  });

  it("does not write through a link Kontext put in place of status.json", () => {
    const { root, run, control } = setup();
    run("install");
    const outside = join(root, "outside");
    writeFileSync(outside, "unverändert");
    rmSync(join(control, "status.json"));
    spawnSync("ln", ["-s", outside, join(control, "status.json")]);
    run("status");
    expect(readFileSync(outside, "utf8")).toBe("unverändert");
  });

  it("stays in the control directory when Kontext swaps it for a link after the check", () => {
    const { root, bin, run, script, swapCommand } = setup();
    run("install");
    const outside = join(root, "outside");
    mkdirSync(outside);
    // The swap at the moment the host makes its temporary file.
    const mktemp = spawnSync("sh", ["-c", "command -v mktemp"]).stdout.toString().trim();
    script(join(bin, "mktemp"), `${swapCommand(outside)}\nexec ${mktemp} "$@"`);
    run("status");
    expect(existsSync(join(outside, "status.json"))).toBe(false);
  });

  it("does not delete a run-now outside the volume when the directory is swapped", () => {
    const { root, bin, run, kontextWrites, script, swapCommand } = setup();
    run("install");
    const outside = join(root, "outside");
    mkdirSync(outside);
    writeFileSync(join(outside, "run-now"), "not Kontext's");
    kontextWrites("run-now", "");
    kontextWrites("settings.json", '{"enabled":true,"time":"04:30"}');
    const systemctl = readFileSync(join(bin, "systemctl"), "utf8").replace("#!/bin/sh\n", "");
    script(join(bin, "systemctl"), `${swapCommand(outside)}\n${systemctl}`);
    run("apply");
    expect(readFileSync(join(outside, "run-now"), "utf8")).toBe("not Kontext's");
  });

  it("refuses a control directory that already is a link", () => {
    const { root, run, control } = setup();
    run("install");
    const outside = join(root, "outside");
    mkdirSync(outside);
    rmSync(control, { recursive: true });
    spawnSync("ln", ["-s", outside, control]);
    expect(run("status").status).not.toBe(0);
    expect(existsSync(join(outside, "status.json"))).toBe(false);
  });

  it("takes up run-now even when the time cannot be applied", () => {
    const { bin, run, kontextWrites, control, script, systemctl } = setup();
    run("install");
    const stand = readFileSync(join(bin, "systemctl"), "utf8").replace("#!/bin/sh\n", "");
    script(join(bin, "systemctl"), `[ "$1" = daemon-reload ] && exit 1\n${stand}`);
    kontextWrites("run-now", "");
    kontextWrites("settings.json", '{"enabled":true,"time":"04:30"}');
    run("apply");
    expect(existsSync(join(control, "run-now"))).toBe(false);
    expect(systemctl()).toContain("start --no-block kontext-backup.service");
  });

  it("skips the timer's run while backup.sh started by hand holds the lock", async () => {
    const { run, status, lock } = setup(null);
    run("install");
    const byHand = spawn("flock", [lock, "sleep", "3"]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    run("run");
    byHand.kill();
    expect(status().lastRun).toMatchObject({
      ok: false,
      message: "Übersprungen: Eine andere Sicherung lief gerade.",
    });
  });

  it("names an SFTP target without a user", () => {
    const { deploy, run, status } = setup();
    writeFileSync(join(deploy, ".env"), "RESTIC_REPOSITORY=sftp:nas.firma.de:/kontext\n");
    run("install");
    expect(status().target).toBe("SFTP nas.firma.de:/kontext");
  });
});
