import { describe, expect, it } from "vitest";
import { formatDuration, recordingType, voiceFile, waveform } from "./voice";

describe("voice messages", () => {
  it("record in Opus where the browser can, else in what it has", () => {
    expect(recordingType(() => true)).toBe("audio/webm;codecs=opus");
    expect(recordingType((type) => type === "audio/mp4")).toBe("audio/mp4");
    expect(recordingType(() => false)).toBeUndefined();
  });

  it("go up as one file named for its format, without the codecs", () => {
    const webm = voiceFile([new Blob(["a"]), new Blob(["b"])], "audio/webm;codecs=opus");
    expect([webm.name, webm.type, webm.size]).toEqual(["Sprachnachricht.webm", "audio/webm", 2]);
    expect(voiceFile([new Blob(["a"])], "audio/mp4").name).toBe("Sprachnachricht.m4a");
    expect(voiceFile([new Blob(["a"])], "").type).toBe("audio/webm");
  });

  it("show their length as m:ss", () => {
    expect(formatDuration(7.4)).toBe("0:07");
    expect(formatDuration(102)).toBe("1:42");
    expect(formatDuration(725)).toBe("12:05");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
    expect(formatDuration(Number.NaN)).toBe("0:00");
  });

  it("draw the loudest of each stretch against the loudest of all", () => {
    const samples = [0, 0.1, -0.2, 0.05, 0, 0, 0.4, -0.1];
    expect(waveform(samples, 4)).toEqual([0.25, 0.5, 0.08, 1]);
    expect(waveform([0, 0, 0, 0], 2)).toEqual([0.08, 0.08]);
    expect(waveform([0.5], 3)).toEqual([1, 0.08, 0.08]);
  });
});
