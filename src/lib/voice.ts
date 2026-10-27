/**
 * Voice messages in the chat: which format the browser records in, the file that goes up, the
 * length as "m:ss" and the waveform the conversation draws. Pure; recording and playing live in
 * src/features/chat/ (use-voice-recorder.ts, voice-message.tsx).
 */

/**
 * Opus in WebM where the browser has it (Chrome, Firefox, Edge), AAC in MP4 in Safari; all of them
 * play both. The server serves these as audio (server/chat/chat.ts AUDIO_TYPES).
 */
const RECORDING_TYPES = [
  "audio/webm;codecs=opus",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm",
];

/** The first format the browser records in; undefined lets it choose. */
export const recordingType = (isSupported: (type: string) => boolean): string | undefined =>
  RECORDING_TYPES.find(isSupported);

/** A recording stops here and goes as it is: a quarter of an hour stays far below 25 MB. */
export const MAX_VOICE_SECONDS = 15 * 60;

const EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/mp4": "m4a",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
};

/** The recorded pieces as one file, named for a download; the type without its codecs. */
export const voiceFile = (chunks: Blob[], recordedType: string): File => {
  const type = (recordedType.split(";")[0] ?? "").trim().toLowerCase() || "audio/webm";
  return new File(chunks, `Sprachnachricht.${EXTENSIONS[type] ?? "webm"}`, { type });
};

/** "0:07", "1:42", "12:05"; nothing known yet is "0:00". */
export const formatDuration = (seconds: number): string => {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/** The quietest bar still shows as a dot. */
const FLOOR = 0.08;

/**
 * `bars` heights between FLOOR and 1: the loudest sample of each stretch, against the loudest of
 * all, so a quiet recording fills the height as a loud one does.
 */
export const waveform = (samples: ArrayLike<number>, bars: number): number[] => {
  const size = Math.max(1, Math.floor(samples.length / bars));
  const peaks = Array.from({ length: bars }, (_, bar) => {
    let peak = 0;
    for (let i = bar * size; i < Math.min(samples.length, (bar + 1) * size); i++) {
      peak = Math.max(peak, Math.abs(samples[i] ?? 0));
    }
    return peak;
  });
  const loudest = Math.max(...peaks);
  return peaks.map((peak) => (loudest > 0 ? Math.max(FLOOR, peak / loudest) : FLOOR));
};

/**
 * How loud the microphone is now, between FLOOR and 1: the furthest sample from silence in the
 * analyser's time domain bytes (128 is silence), lifted a little so speaking fills the bar.
 */
export const liveLevel = (samples: ArrayLike<number>): number => {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs((samples[i] ?? 128) - 128) / 128);
  }
  return Math.max(FLOOR, Math.min(1, Math.sqrt(peak)));
};

/** The last `count` levels, the newest at the end. */
export const keepLatest = (levels: number[], level: number, count: number): number[] =>
  [...levels, level].slice(-count);
