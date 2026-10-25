/**
 * A message left on the mailbox: the box uploads the recording when the caller hangs up. Kontext
 * keeps it at the call (playable in the list) and puts it as a mail into the mailbox chosen in the
 * Firmenverwaltung.
 */
import type { ImportResult } from "../jmap-server";
import type { PhoneFiles } from "./files";
import { isPhoneWav, wavInfo } from "./sounds";
import type { PhoneStore } from "./store";
import { voicemailMessage } from "./voicemail-message";

export type VoicemailDeps = {
  store: Pick<PhoneStore, "callOfBox" | "setVoicemail" | "settings">;
  files: Pick<PhoneFiles, "saveVoicemail">;
  /** The call changed: tell who sees it. */
  refresh: (callId: string) => Promise<void>;
  importMessage: (accountId: string, message: Uint8Array) => Promise<ImportResult>;
  now?: () => Date;
};

export const createVoicemail = (deps: VoicemailDeps) => ({
  receive: async (
    boxId: string,
    boxCallId: string,
    wav: Uint8Array,
  ): Promise<"ok" | "not-found" | "bad-file"> => {
    const call = await deps.store.callOfBox(boxId, boxCallId);
    if (!call) return "not-found";
    const info = wavInfo(wav);
    if (!isPhoneWav(info)) return "bad-file";
    const seconds = Math.max(1, info.seconds);
    await deps.files.saveVoicemail(call.id, wav);
    await deps.store.setVoicemail(call.id, seconds);
    await deps.refresh(call.id);
    const { deliverTo } = (await deps.store.settings()).mailbox;
    if (deliverTo) {
      const message = voicemailMessage({
        remote: call.remote,
        to: deliverTo.email,
        at: new Date(call.startedAt),
        seconds,
        wav,
      });
      const result = await deps.importMessage(deliverTo.accountId, message);
      if (!result.ok) console.warn(`Mailbox-Nachricht als Mail: ${result.error}`);
    }
    return "ok";
  },
});
