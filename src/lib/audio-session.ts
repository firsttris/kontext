/**
 * What the page's sound is for, as the Audio Session API names it (https://www.w3.org/TR/audio-session/,
 * Safari from iOS 16.4; other browsers lack it and change nothing). On an iPhone the session
 * decides where and whether sound plays: Web Audio (the waveform of a voice message is decoded
 * with it) makes it "ambient", muted by the silent switch, and a microphone recording leaves it
 * "play-and-record", quiet on the earpiece. A voice message then starts silent; only the next
 * play, once the audio element has moved the session itself, is heard.
 */

export type AudioSessionType = "auto" | "playback" | "transient" | "ambient" | "play-and-record";

type WithAudioSession = { audioSession?: { type: AudioSessionType } };

/** Sets the session where the browser has one; `"auto"` hands the choice back to the browser. */
export const setAudioSession = (
  type: AudioSessionType,
  host: WithAudioSession | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as WithAudioSession),
) => {
  if (host?.audioSession) host.audioSession.type = type;
};
