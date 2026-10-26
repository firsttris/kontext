// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readEnv } from "./env";

const SECRET = "x".repeat(48);

describe("settings", () => {
  it("start with real secrets", () => {
    const env = readEnv({ BETTER_AUTH_SECRET: SECRET, LIVEKIT_API_SECRET: SECRET });
    expect(env.LIVEKIT_API_SECRET).toBe(SECRET);
  });

  it("refuse the placeholders from .env.example, long as they are", () => {
    const placeholder = "change-me-to-48-random-characters";
    expect(() => readEnv({ BETTER_AUTH_SECRET: placeholder })).toThrow(/Platzhalter/);
    expect(() => readEnv({ BETTER_AUTH_SECRET: SECRET, LIVEKIT_API_SECRET: placeholder })).toThrow(
      /LIVEKIT_API_SECRET/,
    );
    expect(() =>
      readEnv({ BETTER_AUTH_SECRET: SECRET, SCHREIBZEUG_CLIENT_SECRET: placeholder }),
    ).toThrow(/SCHREIBZEUG_CLIENT_SECRET/);
  });

  it("leave calls and documents off without their secrets", () => {
    const env = readEnv({ BETTER_AUTH_SECRET: SECRET, LIVEKIT_API_SECRET: "" });
    expect(env.LIVEKIT_API_SECRET).toBeUndefined();
  });
});
