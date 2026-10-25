// @vitest-environment node
import { existsSync } from "node:fs";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { encodeWav } from "../../server/phone/sounds";
import { createBoxFiles } from "./files";

const credentials = { url: "https://kontext.firma.de", boxId: "b1", token: "secret" };

describe("the box's files", () => {
  it("fetches each sound once, with its token", async () => {
    const dir = await mkdtemp(join(tmpdir(), "box-sounds-"));
    const asked: string[] = [];
    const files = createBoxFiles({
      credentials,
      soundDir: dir,
      fetcher: (async (url: string, init: RequestInit) => {
        asked.push(`${url} ${(init.headers as Record<string, string>).authorization}`);
        return new Response(new Uint8Array([1, 2, 3]));
      }) as unknown as typeof fetch,
    });
    await files.syncSounds(["aaa", "bbb"]);
    await files.syncSounds(["aaa"]);
    expect(asked).toEqual([
      "https://kontext.firma.de/api/phone/box/files/sounds/aaa Bearer secret",
      "https://kontext.firma.de/api/phone/box/files/sounds/bbb Bearer secret",
    ]);
    expect([...(await readFile(join(dir, "aaa.wav")))]).toEqual([1, 2, 3]);
  });

  it("sends a recording up, again after a hiccup, and then removes it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "box-rec-"));
    await writeFile(join(dir, "1729.1.wav"), encodeWav(new Int16Array(8000 * 2)));
    const statuses = [503, 204];
    const files = createBoxFiles({
      credentials,
      soundDir: dir,
      wait: async () => undefined,
      fetcher: (async () =>
        new Response(null, { status: statuses.shift() })) as unknown as typeof fetch,
    });
    expect(await files.sendRecording("1729.1", join(dir, "1729.1"))).toBe(true);
    expect(statuses).toEqual([]);
    expect(existsSync(join(dir, "1729.1.wav"))).toBe(false);
  });

  it("drops a recording too short to be a message, and gives up on a refusal", async () => {
    const dir = await mkdtemp(join(tmpdir(), "box-short-"));
    await writeFile(join(dir, "short.wav"), encodeWav(new Int16Array(100)));
    let asked = 0;
    const files = createBoxFiles({
      credentials,
      soundDir: dir,
      wait: async () => undefined,
      fetcher: (async () => {
        asked++;
        return new Response(null, { status: 404 });
      }) as unknown as typeof fetch,
    });
    expect(await files.sendRecording("short", join(dir, "short"))).toBe(false);
    expect(asked).toBe(0);
    expect(await files.uploadVoicemail("x", encodeWav(new Int16Array(8000)))).toBe(false);
    expect(asked).toBe(1);
  });
});
