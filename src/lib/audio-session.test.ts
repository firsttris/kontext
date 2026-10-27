import { describe, expect, it } from "vitest";
import { holdMicrophone, setAudioSession, setPlaybackSession } from "./audio-session";

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

  it("keeps a held microphone from being ended by playback", () => {
    const host = { audioSession: { type: "playback" as string } } as {
      audioSession: { type: "auto" | "playback" };
    };
    const release = holdMicrophone(host);
    expect(host.audioSession.type).toBe("auto");
    setPlaybackSession(host);
    expect(host.audioSession.type).toBe("auto");
    release();
    release();
    setPlaybackSession(host);
    expect(host.audioSession.type).toBe("playback");
  });
});
