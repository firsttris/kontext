/**
 * What the agent needs from the telephone system: apply a configuration, put a ringing call into
 * a room, dial, hang up – and hear call steps and the registration. Asterisk does it here; the
 * dev box (dev/fake-box.ts) pretends to.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BoxConfig, CallEvent } from "../../server/phone/protocol";
import { type Ami, callEventOf, connectAmi, type Frame, registrationOf } from "./ami";
import { type AmiLogin, asteriskFiles, type BoxPaths, lineEndpoint } from "./asterisk-config";
import type { BoxFiles } from "./files";

export type Pbx = {
  apply: (config: BoxConfig) => Promise<void>;
  answer: (call: string, room: string) => Promise<void>;
  dial: (call: string, room: string, number: string, line?: string) => Promise<void>;
  hangup: (call: string) => Promise<void>;
  hold: (call: string) => Promise<void>;
  resume: (call: string, room: string) => Promise<void>;
};

export type PbxEvents = {
  onCall: (event: Omit<CallEvent, "type" | "seq">) => void;
  onRegistration: (registered: boolean, detail: string) => void;
};

/** How often the box asks Asterisk whether it is still signed in at the Fritzbox. */
const REGISTRATION_CHECK_MS = 60_000;

export const createAsterisk = async ({
  configDir,
  paths,
  files,
  ami: login,
  events,
}: {
  configDir: string;
  paths: BoxPaths;
  files: BoxFiles;
  ami: AmiLogin;
  events: PbxEvents;
}): Promise<Pbx & { close: () => void }> => {
  // AMI acts on channels, Kontext on calls. The line outside (to the Fritzbox) is what one
  // holds, moves and hangs up; for a call out, before it is answered, there is only the line
  // into Kontext's room.
  const outside = new Map<string, string>();
  const intoRoom = new Map<string, string>();
  /** A call that ended on the mailbox: its message goes up before Kontext hears of the end. */
  const ended = async (event: Omit<CallEvent, "type" | "seq">, recording: string | undefined) => {
    if (recording) await files.sendRecording(event.call, recording).catch(() => false);
    events.onCall(event);
  };
  const onFrame = (frame: Frame) => {
    const event = callEventOf(frame, new Date());
    if (event) {
      if (event.state === "ended") {
        outside.delete(event.call);
        intoRoom.delete(event.call);
        void ended(event, frame.Recording || undefined);
        return;
      }
      if (frame.Channel && event.direction === "out" && event.state === "ringing") {
        intoRoom.set(event.call, frame.Channel);
      } else if (frame.Channel && !event.forwarded) {
        outside.set(event.call, frame.Channel);
      }
      events.onCall(event);
      return;
    }
    const registration = registrationOf(frame);
    if (registration) events.onRegistration(registration.registered, registration.detail);
  };
  const ami: Ami = await connectAmi({
    port: login.port,
    username: login.username,
    secret: login.secret,
    onFrame,
    // Asterisk went away: let the container restart both.
    onClose: () => process.exit(1),
  });
  const check = setInterval(
    () => void ami.action([["Action", "PJSIPShowRegistrationsOutbound"]]).catch(() => undefined),
    REGISTRATION_CHECK_MS,
  );

  const lineOf = (call: string) => {
    const channel = outside.get(call);
    if (!channel) throw new Error(`Kein Kanal für ${call}`);
    return channel;
  };
  /** Sets ${KONTEXT_ROOM} and moves the line outside into a context of the dialplan. */
  const moveTo = async (call: string, context: string, exten: string, room?: string) => {
    const channel = lineOf(call);
    if (room) {
      await ami.action([
        ["Action", "Setvar"],
        ["Channel", channel],
        ["Variable", "KONTEXT_ROOM"],
        ["Value", room],
      ]);
    }
    await ami.action([
      ["Action", "Redirect"],
      ["Channel", channel],
      ["Context", context],
      ["Exten", exten],
      ["Priority", "1"],
    ]);
  };

  return {
    apply: async (config) => {
      // The sounds first: a dialplan that plays a missing file stays silent.
      await files.syncSounds(config.sounds);
      await mkdir(paths.recordings, { recursive: true });
      await mkdir(configDir, { recursive: true });
      for (const [name, text] of Object.entries(asteriskFiles(config, login, paths))) {
        await writeFile(join(configDir, name), text, { mode: 0o640 });
      }
      await ami.action([
        ["Action", "Command"],
        ["Command", "core reload"],
      ]);
      await ami.action([["Action", "PJSIPShowRegistrationsOutbound"]]);
    },
    answer: (call, room) => moveTo(call, "kontext-answer", "answer", room),
    hold: (call) => moveTo(call, "kontext-hold", "s"),
    resume: (call, room) => moveTo(call, "kontext-resume", "s", room),
    dial: async (call, room, number, line) => {
      // First the leg into Kontext's room (LiveKit SIP answers at once), then the number.
      await ami.action([
        ["Action", "Originate"],
        ["Channel", `PJSIP/${room}@livekit`],
        ["Context", "kontext-out"],
        ["Exten", number],
        ["Priority", "1"],
        ["Variable", `__KONTEXT_CALL=${call}`],
        ["Variable", `KONTEXT_OUT=${line ? lineEndpoint(line) : "fritzbox"}`],
        ["CallerID", "Kontext"],
        ["Async", "true"],
      ]);
    },
    hangup: async (call) => {
      const channel = outside.get(call) ?? intoRoom.get(call);
      if (!channel) return;
      await ami.action([
        ["Action", "Hangup"],
        ["Channel", channel],
        ["Cause", "16"],
      ]);
    },
    close: () => {
      clearInterval(check);
      ami.close();
    },
  };
};
