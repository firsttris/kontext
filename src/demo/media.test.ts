import { afterEach, describe, expect, it, vi } from "vitest";
import { serveMedia } from "./media";

const ORIGIN = "https://demo.test";
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A demo server that answers one voicemail and nothing else. */
const handle = vi.fn(async (request: Request) =>
  new URL(request.url).pathname === "/api/phone/calls/p1/voicemail"
    ? new Response("sound", { headers: { "content-type": "audio/mp4" } })
    : new Response(null, { status: 404 }),
);

afterEach(() => {
  document.body.replaceChildren();
  handle.mockClear();
});

describe("serveMedia", () => {
  it("gives a player at /api/ the demo server's sound as a blob URL", async () => {
    const real = URL.createObjectURL;
    URL.createObjectURL = () => "blob:voicemail";
    const stop = serveMedia(handle, ORIGIN, document.body);
    const first = document.createElement("audio");
    first.setAttribute("src", "/api/phone/calls/p1/voicemail");
    const second = document.createElement("audio");
    document.body.append(first, second);
    second.setAttribute("src", "/api/phone/calls/p1/voicemail");
    await settle();
    await settle();
    expect(first.getAttribute("src")).toBe("blob:voicemail");
    expect(second.getAttribute("src")).toBe("blob:voicemail");
    // Once per address, however many players show it.
    expect(handle).toHaveBeenCalledTimes(1);
    stop();
    URL.createObjectURL = real;
  });

  it("leaves a player alone that the demo server has nothing for", async () => {
    const stop = serveMedia(handle, ORIGIN, document.body);
    const audio = document.createElement("audio");
    audio.setAttribute("src", "/api/phone/calls/p9/voicemail");
    document.body.append(audio);
    await settle();
    await settle();
    expect(audio.getAttribute("src")).toBe("/api/phone/calls/p9/voicemail");
    stop();
  });
});
