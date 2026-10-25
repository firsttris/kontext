// @vitest-environment node
import { describe, expect, it } from "vitest";
import { encodeWav, isPhoneWav, soundId, soundLength, wavInfo } from "./sounds";

describe("WAV for the telephone", () => {
  it("reads back what it encodes", () => {
    const wav = encodeWav(new Int16Array(8000 * 3));
    expect(wavInfo(wav)).toEqual({ sampleRate: 8000, channels: 1, bits: 16, seconds: 3 });
    expect(isPhoneWav(wavInfo(wav))).toBe(true);
  });

  it("turns down other rates, too long files and what is no WAV", () => {
    expect(isPhoneWav(wavInfo(encodeWav(new Int16Array(48000), 48000)))).toBe(false);
    expect(isPhoneWav(wavInfo(encodeWav(new Int16Array(8000 * 181))))).toBe(false);
    expect(
      wavInfo(new TextEncoder().encode("ID3 not a wave file at all, sorry about that.....")),
    ).toBe(null);
  });

  it("counts to the end when Asterisk has not written the length yet", () => {
    const wav = encodeWav(new Int16Array(8000 * 2));
    new DataView(wav.buffer).setUint32(40, 0xffffffff, true);
    expect(wavInfo(wav)?.seconds).toBe(2);
  });

  it("names a sound by its content and shows its length", async () => {
    const id = await soundId(encodeWav(new Int16Array(10)));
    expect(id).toMatch(/^[a-f0-9]{24}$/);
    expect(await soundId(encodeWav(new Int16Array(10)))).toBe(id);
    expect(soundLength(65)).toBe("1:05");
  });
});
