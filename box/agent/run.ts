/**
 * The agent's work, whatever the telephone system: the link to Kontext carries commands to the
 * PBX and the PBX's call steps and registration back. Used by the real box (main.ts, Asterisk) and
 * the dev box (dev/fake-box.ts).
 */
import type { BoxConfig, ToBox } from "../../server/phone/protocol";
import { type Credentials, connect, type Link } from "./link";
import type { Pbx, PbxEvents } from "./pbx";

export type BoxState = {
  connected: boolean;
  registered: boolean;
  detail: string;
  configVersion: number | null;
  error: string | null;
};

export const runBox = async ({
  credentials,
  version,
  makePbx,
  lastConfig,
  remember,
}: {
  credentials: Credentials;
  version: string;
  makePbx: (events: PbxEvents) => Promise<Pbx>;
  /** The configuration from before a restart: the box telephones with it until Kontext answers. */
  lastConfig?: BoxConfig | null;
  /** Keeps each new configuration for the next start. */
  remember?: (config: BoxConfig) => Promise<void>;
}): Promise<{ link: Link; state: () => BoxState; config: () => BoxConfig | null }> => {
  let link: Link | null = null;
  let current: BoxConfig | null = lastConfig ?? null;
  const state: BoxState = {
    connected: false,
    registered: false,
    detail: "",
    configVersion: null,
    error: null,
  };
  const pbx = await makePbx({
    onCall: (event) => link?.event(event),
    onRegistration: (registered, detail) => {
      state.registered = registered;
      state.detail = detail;
      link?.status(registered, detail);
    },
  });

  if (lastConfig) await pbx.apply(lastConfig).catch(() => undefined);

  const onCommand = async (command: ToBox) => {
    try {
      if (command.type === "config") {
        await pbx.apply(command.config);
        current = command.config;
        await remember?.(command.config);
        state.configVersion = command.version;
        state.error = null;
        link?.applied(command.version);
      }
      if (command.type === "answer") await pbx.answer(command.call, command.room);
      if (command.type === "dial") {
        await pbx.dial(command.call, command.room, command.number, command.line);
      }
      if (command.type === "hangup") await pbx.hangup(command.call);
      if (command.type === "hold") await pbx.hold(command.call);
      if (command.type === "door-open") await pbx.doorOpen(command.call, command.code);
      if (command.type === "record") await pbx.record(command.call, command.room);
      if (command.type === "record-stop") await pbx.recordStop(command.call);
      if (command.type === "resume") await pbx.resume(command.call, command.room);
    } catch (error) {
      state.error = (error as Error).message;
      if (command.type === "config") link?.applied(command.version, state.error);
    }
  };

  link = connect(credentials, { version, onCommand: (command) => void onCommand(command) });
  // What the PBX reported before the link existed goes out with the first connection.
  if (state.detail) link.status(state.registered, state.detail);
  return {
    link,
    state: () => ({ ...state, connected: link?.connected() ?? false }),
    config: () => current,
  };
};
