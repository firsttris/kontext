/**
 * A recorded call: the box uploads the recording when recording stops or the call ends. Kontext
 * keeps it at the call (playable in the list for whoever may see the call); it does not mail it.
 */
import type { PhoneFiles } from "./files";
import { PHONE_WAV, wavInfo } from "./sounds";
import type { PhoneStore } from "./store";

/** Four hours of telephone audio are about 230 MB; a call is not longer. */
export const MAX_RECORDING_SECONDS = 4 * 3600;

export type RecordingDeps = {
  store: Pick<PhoneStore, "callOfBox" | "setRecording">;
  files: Pick<PhoneFiles, "saveRecording">;
  refresh: (callId: string) => Promise<void>;
};

export const createRecordings = (deps: RecordingDeps) => ({
  receive: async (
    boxId: string,
    boxCallId: string,
    wav: Uint8Array,
  ): Promise<"ok" | "not-found" | "bad-file"> => {
    const call = await deps.store.callOfBox(boxId, boxCallId);
    if (!call?.recording) return "not-found";
    const info = wavInfo(wav);
    // MixMonitor writes the call as it was heard: telephone audio, possibly 16 kHz with G.722.
    if (!info || info.channels !== PHONE_WAV.channels || info.seconds > MAX_RECORDING_SECONDS) {
      return "bad-file";
    }
    await deps.files.saveRecording(call.id, wav);
    await deps.store.setRecording(call.id, "stopped", Math.max(1, info.seconds));
    await deps.refresh(call.id);
    return "ok";
  },
});
