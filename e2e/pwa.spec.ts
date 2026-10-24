/**
 * Kontext as an installable app, against the built app as in production (served by the server
 * from dist/, see playwright.config.ts): caching headers, manifest, offline start, a share from
 * another app, and above all that a new version reaches the user.
 */
import { readFile, writeFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";

const WORKER = "dist/service-worker.js";

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
      await writeFile(WORKER, `${original}\n// new build ${Date.now()}\n`);
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
      await writeFile(WORKER, original);
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
