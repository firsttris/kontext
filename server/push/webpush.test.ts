// @vitest-environment node
import { describe, expect, it } from "vitest";
import { browserKeys, decryptPayload } from "./receive";
import {
  encryptPayload,
  fromBase64Url,
  generateVapidKeys,
  sendPush,
  toBase64Url,
  vapidAuthorization,
} from "./webpush";

describe("web push", () => {
  it("encrypts so that only the subscribed browser can read it", async () => {
    const browser = await browserKeys();
    const body = await encryptPayload(new TextEncoder().encode('{"title":"Jonas Weber"}'), browser);
    expect(body[20]).toBe(65);
    expect(new DataView(body.buffer).getUint32(16)).toBe(4096);
    expect(await decryptPayload(body, browser)).toBe('{"title":"Jonas Weber"}');
    const stranger = await browserKeys();
    await expect(decryptPayload(body, { ...stranger, p256dh: browser.p256dh })).rejects.toThrow();
  });

  it("signs a VAPID token the push service can check with the public key", async () => {
    const keys = await generateVapidKeys();
    const header = await vapidAuthorization(
      "https://fcm.googleapis.com/fcm/send/abc",
      keys,
      "https://kontext.example",
      Date.UTC(2026, 9, 24),
    );
    const [, token, k] = /^vapid t=(.+), k=(.+)$/.exec(header)!;
    expect(k).toBe(keys.publicKey);
    const [head, claims, signature] = token!.split(".");
    expect(JSON.parse(atob(claims!.replace(/-/g, "+").replace(/_/g, "/")))).toEqual({
      aud: "https://fcm.googleapis.com",
      exp: Date.UTC(2026, 9, 24) / 1000 + 12 * 3600,
      sub: "https://kontext.example",
    });
    const publicKey = await crypto.subtle.importKey(
      "raw",
      fromBase64Url(keys.publicKey),
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      publicKey,
      fromBase64Url(signature!),
      new TextEncoder().encode(`${head}.${claims}`),
    );
    expect(ok).toBe(true);
  });

  it("posts the encrypted message with the headers push services want", async () => {
    const browser = await browserKeys();
    const keys = await generateVapidKeys();
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    const result = await sendPush(
      {
        endpoint: "https://push.example/abc",
        keys: { p256dh: browser.p256dh, auth: browser.auth },
      },
      { title: "Neue Mail" },
      keys,
      "https://kontext.example",
      { fetch: fake, urgency: "high" },
    );
    expect(result.status).toBe(201);
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers["content-encoding"]).toBe("aes128gcm");
    expect(headers.urgency).toBe("high");
    expect(headers.authorization).toMatch(/^vapid t=/);
    expect(await decryptPayload(seen!.init.body as Uint8Array, browser)).toBe(
      '{"title":"Neue Mail"}',
    );
    expect(toBase64Url(fromBase64Url(browser.auth))).toBe(browser.auth);
  });
});
