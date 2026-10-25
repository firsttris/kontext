/**
 * Greetings for the telephone: whatever the browser recorded or someone uploaded (WebM, MP3,
 * M4A, WAV …) becomes the WAV the box plays – 8 kHz, mono, 16-bit (server/phone/sounds.ts).
 */
import { encodeWav, PHONE_WAV } from "../../server/phone/sounds";

/** Samples from -1…1 to 16-bit, clipped. Pure. */
export const floatToInt16 = (samples: Float32Array): Int16Array =>
  Int16Array.from(samples, (sample) => {
    const clipped = Math.max(-1, Math.min(1, sample));
    return Math.round(clipped < 0 ? clipped * 0x8000 : clipped * 0x7fff);
  });

/** Decodes any audio the browser can play and renders it again at the telephone's rate. */
export const toPhoneWav = async (audio: Blob): Promise<Uint8Array> => {
  const decoded = await new AudioContext().decodeAudioData(await audio.arrayBuffer());
  const { sampleRate } = PHONE_WAV;
  const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * sampleRate), sampleRate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return encodeWav(floatToInt16(rendered.getChannelData(0)), sampleRate);
};
