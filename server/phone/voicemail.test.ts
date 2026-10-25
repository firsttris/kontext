// @vitest-environment node
import { describe, expect, it } from "vitest";
import { incomingCall, type PhoneCall } from "./phone";
import { encodeWav } from "./sounds";
import type { PhoneSettings } from "./store";
import { createVoicemail } from "./voicemail";

const call: PhoneCall = incomingCall(
  {
    type: "event",
    seq: 1,
    call: "1729.1",
    state: "ringing",
    direction: "in",
    remote: "07223 812345",
    local: "",
    at: "2026-10-26T08:14:00.000Z",
  },
  { id: "c1", boxId: "b1", members: ["jonas"] },
);

const setup = (deliverTo: PhoneSettings["mailbox"]["deliverTo"]) => {
  const saved: Record<string, Uint8Array> = {};
  const seconds: Record<string, number> = {};
  const imported: { accountId: string; text: string }[] = [];
  const refreshed: string[] = [];
  const voicemail = createVoicemail({
    store: {
      callOfBox: async (boxId, boxCallId) =>
        boxId === "b1" && boxCallId === "1729.1" ? call : null,
      setVoicemail: async (id, length) => {
        seconds[id] = length;
      },
      settings: async () =>
        ({
          mailbox: { enabled: true, ringSeconds: 20, greeting: null, deliverTo },
        }) as PhoneSettings,
    },
    files: {
      saveVoicemail: async (id, bytes) => {
        saved[id] = bytes;
      },
    },
    refresh: async (id) => void refreshed.push(id),
    importMessage: async (accountId, message) => {
      imported.push({ accountId, text: new TextDecoder().decode(message) });
      return { ok: true, emailId: "m1" };
    },
  });
  return { voicemail, saved, seconds, imported, refreshed };
};

describe("a message on the mailbox", () => {
  const wav = encodeWav(new Int16Array(8000 * 12));

  it("stays at the call and goes as a mail to the chosen mailbox", async () => {
    const { voicemail, saved, seconds, imported, refreshed } = setup({
      accountId: "info",
      email: "info@weber-haustechnik.test",
    });
    expect(await voicemail.receive("b1", "1729.1", wav)).toBe("ok");
    expect(saved.c1).toBe(wav);
    expect(seconds).toEqual({ c1: 12 });
    expect(refreshed).toEqual(["c1"]);
    expect(imported).toHaveLength(1);
    expect(imported[0]!.accountId).toBe("info");
    expect(imported[0]!.text).toContain("Subject: Nachricht von 07223 812345 (0:12)");
  });

  it("is kept without a mail when no mailbox is chosen", async () => {
    const { voicemail, imported, seconds } = setup(null);
    expect(await voicemail.receive("b1", "1729.1", wav)).toBe("ok");
    expect(seconds.c1).toBe(12);
    expect(imported).toEqual([]);
  });

  it("turns down unknown calls and files that are no telephone WAV", async () => {
    const { voicemail } = setup(null);
    expect(await voicemail.receive("b2", "1729.1", wav)).toBe("not-found");
    expect(await voicemail.receive("b1", "1729.1", encodeWav(new Int16Array(10), 44100))).toBe(
      "bad-file",
    );
  });
});
