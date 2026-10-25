/**
 * Asterisk's manager interface (AMI): a text protocol on localhost, "Key: Value" lines and a blank
 * line per message. The agent logs in, sends actions (answer by moving the call, originate, hang
 * up, reload) and hears the dialplan's KontextCall user events and the Fritzbox registration.
 */
import { CALL_STATES, type CallEvent } from "../../server/phone/protocol";

export type Frame = Record<string, string>;

/** Messages from what arrived so far, and the unfinished rest. Pure. */
export const parseFrames = (buffer: string): { frames: Frame[]; rest: string } => {
  const blocks = buffer.split("\r\n\r\n");
  const rest = blocks.pop() ?? "";
  const frames = blocks
    .map((block) =>
      Object.fromEntries(
        block
          .split("\r\n")
          .map((line) => {
            const colon = line.indexOf(": ");
            return colon > 0 ? [line.slice(0, colon), line.slice(colon + 2)] : null;
          })
          .filter((pair): pair is [string, string] => pair !== null),
      ),
    )
    .filter((frame) => Object.keys(frame).length > 0);
  return { frames, rest };
};

/** One action as AMI reads it; values cannot break into the next line. */
export const formatAction = (fields: [string, string][]): string =>
  `${fields.map(([key, value]) => `${key}: ${value.replace(/[\r\n]/g, "")}`).join("\r\n")}\r\n\r\n`;

/** The dialplan's report of a call step, as a call event for Kontext; null for anything else. */
export const callEventOf = (frame: Frame, now: Date): Omit<CallEvent, "type" | "seq"> | null => {
  if (frame.Event !== "UserEvent" || frame.UserEvent !== "KontextCall") return null;
  const state = frame.State;
  const direction = frame.Direction;
  if (!frame.Call || !(CALL_STATES as readonly string[]).includes(state ?? "")) return null;
  if (direction !== "in" && direction !== "out") return null;
  const cause = Number(frame.Cause);
  return {
    call: frame.Call,
    state: state as CallEvent["state"],
    direction,
    remote: frame.Remote ?? "",
    local: frame.Local ?? "",
    ...(Number.isFinite(cause) && frame.Cause ? { cause } : {}),
    ...(frame.Forwarded === "1" ? { forwarded: true } : {}),
    at: now.toISOString(),
  };
};

/** Whether the box is signed in at the Fritzbox, from a registration event; null if unrelated. */
export const registrationOf = (frame: Frame): { registered: boolean; detail: string } | null => {
  if (frame.Event === "Registry" && frame.ChannelType === "PJSIP") {
    return { registered: frame.Status === "Registered", detail: frame.Status ?? "" };
  }
  if (frame.Event === "OutboundRegistrationDetail") {
    return { registered: frame.Status === "Registered", detail: frame.Status ?? "" };
  }
  return null;
};

export type Ami = {
  action: (fields: [string, string][]) => Promise<Frame>;
  close: () => void;
};

/** Connects and logs in; events go to `onFrame`. Rejects when Asterisk cannot be reached. */
export const connectAmi = ({
  port,
  username,
  secret,
  onFrame,
  onClose,
}: {
  port: number;
  username: string;
  secret: string;
  onFrame: (frame: Frame) => void;
  onClose: () => void;
}): Promise<Ami> =>
  new Promise((resolve, reject) => {
    let buffer = "";
    let nextId = 0;
    const waiting = new Map<string, (frame: Frame) => void>();
    void Bun.connect({
      hostname: "127.0.0.1",
      port,
      socket: {
        data: (_socket, data) => {
          const { frames, rest } = parseFrames(buffer + data.toString());
          buffer = rest;
          for (const frame of frames) {
            const answer = frame.ActionID ? waiting.get(frame.ActionID) : undefined;
            if (answer && frame.Response) {
              waiting.delete(frame.ActionID!);
              answer(frame);
            } else onFrame(frame);
          }
        },
        close: onClose,
        error: onClose,
      },
    })
      .then(async (socket) => {
        const action: Ami["action"] = (fields) =>
          new Promise((done) => {
            const id = `kontext-${++nextId}`;
            waiting.set(id, done);
            socket.write(formatAction([...fields, ["ActionID", id]]));
          });
        const login = await action([
          ["Action", "Login"],
          ["Username", username],
          ["Secret", secret],
        ]);
        if (login.Response !== "Success") {
          socket.end();
          reject(new Error(login.Message ?? "AMI login refused"));
          return;
        }
        resolve({ action, close: () => socket.end() });
      })
      .catch(reject);
  });
