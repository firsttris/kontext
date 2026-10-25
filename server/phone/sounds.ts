/**
 * Sounds for the telephone box: greetings ("Ansagen") and messages left on the mailbox, as WAV
 * the way Asterisk plays and records them – 8 kHz, mono, 16-bit PCM. The app converts what it
 * records or uploads into that form (src/lib/wav.ts); the server only checks it. Pure.
 */

export type WavInfo = { sampleRate: number; channels: number; bits: number; seconds: number };

/** The telephone's own format; anything else would play too fast, too slow or as noise. */
export const PHONE_WAV = { sampleRate: 8000, channels: 1, bits: 16 } as const;

/** At most this long: greetings are short, messages end after two minutes. */
export const MAX_SOUND_SECONDS = 180;

const text = (bytes: Uint8Array, at: number, length: number) =>
  String.fromCharCode(...bytes.subarray(at, at + length));

/**
 * What a RIFF/WAVE file holds (PCM only), from its "fmt " and "data" chunks; null for anything
 * else. Asterisk writes the data length only at the end, so an unfinished size counts to the end.
 */
export const wavInfo = (bytes: Uint8Array): WavInfo | null => {
  if (bytes.length < 44 || text(bytes, 0, 4) !== "RIFF" || text(bytes, 8, 4) !== "WAVE") {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: Omit<WavInfo, "seconds"> | null = null;
  for (let at = 12; at + 8 <= bytes.length; ) {
    const id = text(bytes, at, 4);
    const size = view.getUint32(at + 4, true);
    if (id === "fmt ") {
      if (view.getUint16(at + 8, true) !== 1) return null;
      format = {
        channels: view.getUint16(at + 10, true),
        sampleRate: view.getUint32(at + 12, true),
        bits: view.getUint16(at + 22, true),
      };
    }
    if (id === "data") {
      if (!format) return null;
      const length = Math.min(size, bytes.length - at - 8);
      const perSecond = format.sampleRate * format.channels * (format.bits / 8);
      return { ...format, seconds: Math.round(length / perSecond) };
    }
    at += 8 + size + (size % 2);
  }
  return null;
};

/** Whether the box can play it as it is. */
export const isPhoneWav = (info: WavInfo | null): info is WavInfo =>
  info !== null &&
  info.sampleRate === PHONE_WAV.sampleRate &&
  info.channels === PHONE_WAV.channels &&
  info.bits === PHONE_WAV.bits &&
  info.seconds <= MAX_SOUND_SECONDS;

/** A sound's id from its content: the box downloads each once and keeps it. */
export const soundId = async (bytes: Uint8Array): Promise<string> => {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)));
  return Array.from(digest.subarray(0, 12), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** "1:05" */
export const soundLength = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;

/** 16-bit mono PCM samples as a WAV file; the app encodes what it recorded with this too. */
export const encodeWav = (samples: Int16Array, sampleRate: number = PHONE_WAV.sampleRate) => {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const ascii = (at: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
  };
  ascii(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, "data");
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => {
    view.setInt16(44 + i * 2, sample, true);
  });
  return bytes;
};
