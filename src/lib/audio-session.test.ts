import { describe, expect, it } from "vitest";
import { setAudioSession } from "./audio-session";

describe("setAudioSession", () => {
  it("sets the type where the browser has an audio session", () => {
    const host = { audioSession: { type: "auto" as const } };
    setAudioSession("playback", host);
    expect(host.audioSession.type).toBe("playback");
  });

  it("does nothing where it has none", () => {
    expect(() => setAudioSession("playback", {})).not.toThrow();
    expect(() => setAudioSession("playback", undefined)).not.toThrow();
  });
});
