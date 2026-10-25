// @vitest-environment node
import { describe, expect, it } from "vitest";
import { incomingCall } from "./phone";
import { createRecordings } from "./recordings";
import { encodeWav } from "./sounds";

const call = {
  ...incomingCall(
    {
      type: "event",
      seq: 1,
      call: "1729.7",
      state: "ringing",
      direction: "in",
      remote: "07223 812345",
      local: "",
      at: "2026-10-26T08:14:00.000Z",
    },
    { id: "c7", boxId: "b1", members: ["jonas"] },
  ),
  recording: "running" as const,
};

describe("a recorded call", () => {
  it("stays at the call with its length", async () => {
    const lengths: string[] = [];
    const recordings = createRecordings({
      store: {
        callOfBox: async (boxId) => (boxId === "b1" ? call : null),
        setRecording: async (id, state, seconds) => void lengths.push(`${id}:${state}:${seconds}`),
      },
      files: { saveRecording: async () => undefined },
      refresh: async () => undefined,
    });
    expect(await recordings.receive("b1", "1729.7", encodeWav(new Int16Array(8000 * 61)))).toBe(
      "ok",
    );
    expect(lengths).toEqual(["c7:stopped:61"]);
    expect(await recordings.receive("b2", "1729.7", encodeWav(new Int16Array(10)))).toBe(
      "not-found",
    );
    expect(await recordings.receive("b1", "1729.7", new Uint8Array(100))).toBe("bad-file");
  });
});
