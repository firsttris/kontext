/**
 * Kontext as an installable app, against the built app as in production (served by the server
 * from dist/, see playwright.config.ts): caching headers, manifest, offline start, a share from
 * another app, and above all that a new version reaches the user.
 */
import { readFile, writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { compressFile } from "../dev/precompress";

const WORKER = "dist/service-worker.js";

/** The worker as a build writes it: with its Brotli and gzip copies, which the server prefers. */
const writeWorker = async (source: string) => {
  await writeFile(WORKER, source);
  await compressFile(WORKER);
};

/** The page is controlled by an active service worker (after a reload on first visit). */
const controlled = async (page: Page) => {
  await page.goto("/login");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
};

test.describe("App (PWA)", () => {
  test("liefert Worker, Seite und Manifest immer frisch, Bausteine dauerhaft", async ({
    request,
  }) => {
    for (const path of ["/service-worker.js", "/manifest.webmanifest", "/login"]) {
      const response = await request.get(path);
      expect(response.ok(), path).toBe(true);
      expect(response.headers()["cache-control"], path).toBe("no-cache");
    }
    const manifest = await (await request.get("/manifest.webmanifest")).json();
    expect(manifest).toMatchObject({
      name: "Kontext",
      display: "standalone",
      protocol_handlers: [{ protocol: "mailto", url: "/compose?mailto=%s" }],
      share_target: { action: "/share-target", method: "POST" },
    });
    expect(manifest.icons.some((icon: { purpose?: string }) => icon.purpose === "maskable")).toBe(
      true,
    );
  });

  test("liefert Seite und Bausteine mit Brotli, wenn der Browser es nimmt", async ({ request }) => {
    const page = await request.get("/login", { headers: { "accept-encoding": "br, gzip" } });
    expect(page.headers()["content-encoding"]).toBe("br");
    expect(await page.text()).toContain('<div id="root">');
    const script = (await page.text()).match(/\/assets\/index-[\w-]+\.js/)?.[0];
    expect(script).toBeTruthy();
    for (const [accept, encoding] of [
      ["br, gzip", "br"],
      ["gzip", "gzip"],
    ] as const) {
      const response = await request.get(script!, { headers: { "accept-encoding": accept } });
      expect(response.headers()["content-encoding"], accept).toBe(encoding);
      expect(response.headers().vary, accept).toContain("Accept-Encoding");
      expect(response.headers()["cache-control"]).toContain("immutable");
    }
  });

  test("lädt beim ersten Besuch nur vor, was ohne Netz gebraucht wird", async ({ request }) => {
    const worker = await (await request.get("/service-worker.js")).text();
    const precached = [...worker.matchAll(/assets\/[\w.-]+/g)].map((match) => match[0]);
    expect(precached.some((path) => /^assets\/index-.+\.js$/.test(path))).toBe(true);
    // Calls need the network, S/MIME and other alphabets are rare: cached when first used.
    expect(precached.filter((path) => /livekit|node-forge|cyrillic|vietnamese/.test(path))).toEqual(
      [],
    );
  });

  test("startet auch ohne Netz", async ({ page, context }) => {
    await controlled(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("button", { name: "Anmelden" })).toBeVisible();
    await expect(page.getByText("Keine Verbindung.")).toBeVisible();
    await context.setOffline(false);
  });

  test("bietet eine neue Version an und lädt sie erst auf Wunsch", async ({ page }) => {
    await controlled(page);
    const first = await page.evaluate(
      async () => (await navigator.serviceWorker.getRegistration())?.active?.scriptURL,
    );
    const original = await readFile(WORKER, "utf8");
    try {
      // A new build on the server: the worker's bytes change.
      await writeWorker(`${original}\n// new build ${Date.now()}\n`);
      await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
      const banner = page
        .getByRole("status")
        .filter({ hasText: "Eine neue Version von Kontext ist da." });
      await expect(banner).toBeVisible();
      // Waiting, not swapped in by itself.
      expect(
        await page.evaluate(async () =>
          Boolean((await navigator.serviceWorker.getRegistration())?.waiting),
        ),
      ).toBe(true);
      // "Neu laden": the new version takes over and the page loads again under it.
      const reloaded = page.waitForEvent("load");
      await banner.getByRole("button", { name: "Neu laden" }).click();
      await reloaded;
      await expect
        .poll(() =>
          page.evaluate(async () => {
            const registration = await navigator.serviceWorker.getRegistration();
            return Boolean(registration?.active && !registration.waiting);
          }),
        )
        .toBe(true);
      await expect(banner).toHaveCount(0);
      expect(first).toContain("/service-worker.js");
    } finally {
      await writeWorker(original);
    }
  });

  test("nimmt geteilte Dateien für eine neue Mail an", async ({ page }) => {
    await controlled(page);
    const kept = await page.evaluate(async () => {
      const form = new FormData();
      form.append("title", "Schaden Bad");
      form.append("text", "Foto vom Wasserschaden");
      form.append("files", new File(["bild"], "schaden.jpg", { type: "image/jpeg" }));
      const response = await fetch("/share-target", { method: "POST", body: form });
      const cache = await caches.open("kontext-share");
      const keys = (await cache.keys()).map((key) => new URL(key.url).pathname);
      const meta = keys.find((key) => key.endsWith("/meta"));
      return {
        redirected: response.url,
        keys,
        meta: meta ? await (await cache.match(meta))!.json() : null,
      };
    });
    expect(kept.redirected).toMatch(/\/compose\?shared=|\/login/);
    expect(kept.meta).toEqual({
      title: "Schaden Bad",
      text: "Foto vom Wasserschaden",
      url: "",
      files: 1,
    });
    expect(kept.keys.some((key) => key.endsWith("/0"))).toBe(true);
  });
});

test.describe("App (PWA): Push", () => {
  test("zeigt einen Push als Benachrichtigung, außer Kontext ist vorn", async ({
    page,
    context,
  }) => {
    await controlled(page);
    const origin = new URL(page.url()).origin;
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    // Headless Chromium shows no system notifications; the worker's wish to is recorded instead.
    const record = () =>
      worker.evaluate(() => {
        // Only what the test touches of the worker's global scope.
        const scope = self as unknown as {
          shown?: unknown[];
          registration: {
            showNotification: (
              title: string,
              options?: { body?: string; tag?: string; data?: { url?: string } },
            ) => Promise<void>;
          };
        };
        scope.shown = [];
        scope.registration.showNotification = async (title, options) => {
          scope.shown!.push({
            title,
            body: options?.body,
            tag: options?.tag,
            url: options?.data?.url,
          });
        };
      });
    const shown = () =>
      worker.evaluate(() => (self as unknown as { shown?: unknown[] }).shown ?? []);
    const cdp = await context.newCDPSession(page);
    const registrations: { registrationId: string; scopeURL: string }[] = [];
    cdp.on("ServiceWorker.workerRegistrationUpdated", (event) =>
      registrations.push(...event.registrations),
    );
    await cdp.send("ServiceWorker.enable");
    await expect.poll(() => registrations.length).toBeGreaterThan(0);
    const { registrationId } = registrations.find((r) => r.scopeURL.startsWith(origin))!;
    const deliver = (notice: object) =>
      cdp.send("ServiceWorker.deliverPushMessage", {
        origin,
        registrationId,
        data: JSON.stringify(notice),
      });

    // Kontext in front: the app shows it itself.
    await record();
    await page.bringToFront();
    await deliver({ title: "Vorn", body: "", url: "/chat", tag: "chat-vorn" });
    await page.waitForTimeout(500);
    expect(await shown()).toEqual([]);

    // Kontext not open: a system notification, leading to the message.
    await page.goto("about:blank");
    await deliver({
      title: "Jonas Weber",
      body: "Kommst du morgen früher?",
      url: "/chat?channel=c1&message=m1",
      tag: "chat-c1",
    });
    await expect.poll(shown).toEqual([
      {
        title: "Jonas Weber",
        body: "Kommst du morgen früher?",
        tag: "chat-c1",
        url: "/chat?channel=c1&message=m1",
      },
    ]);
  });
});
