import { expect, test } from "@playwright/test";
import { login } from "./helpers";

test.describe("Neue Mail von außen", () => {
  test("öffnet einen mailto:-Link als neue Mail", async ({ page }) => {
    await login(page);
    const link =
      "mailto:petra@keller-elektro.test?cc=anna@weber-haustechnik.test&subject=R%C3%BCckfrage%20Angebot&body=Hallo%20Petra%2C%0Akurze%20Frage";
    await page.goto(`/compose?mailto=${encodeURIComponent(link)}`);
    const form = page.getByRole("form", { name: "Neue Mail" });
    await expect(form.getByLabel("Betreff")).toHaveValue("Rückfrage Angebot");
    await expect(form).toContainText("petra@keller-elektro.test");
    await expect(form).toContainText("anna@weber-haustechnik.test");
    await expect(form.getByRole("textbox", { name: "Ihre Nachricht …" })).toContainText(
      "Hallo Petra,",
    );
  });

  test("macht aus einem geteilten Foto eine Mail mit Anhang", async ({ page }) => {
    await login(page);
    // What the service worker keeps for a share (src/sw/service-worker.ts, src/pwa/share-cache.ts).
    await page.evaluate(async () => {
      const cache = await caches.open("kontext-share");
      await cache.put(
        "/shared/s1/0",
        new Response(new Blob(["foto"], { type: "image/jpeg" }), {
          headers: { "content-type": "image/jpeg", "x-file-name": "schaden.jpg" },
        }),
      );
      await cache.put(
        "/shared/s1/meta",
        Response.json({ title: "Schaden Bad", text: "Foto vom Wasserschaden", url: "", files: 1 }),
      );
    });
    await page.goto("/compose?shared=s1");
    // Shown first; only taken into a mail on request (any page could post to the share target).
    const offer = page.getByRole("region", { name: "Geteilt aus einer anderen App" });
    await expect(offer).toContainText("Schaden Bad");
    await expect(offer).toContainText("schaden.jpg");
    await expect(page.getByRole("form", { name: "Neue Mail" })).toHaveCount(0);
    await offer.getByRole("button", { name: "In neue Mail übernehmen" }).click();
    const form = page.getByRole("form", { name: "Neue Mail" });
    await expect(form.getByLabel("Betreff")).toHaveValue("Schaden Bad");
    await expect(form.getByRole("textbox", { name: "Ihre Nachricht …" })).toContainText(
      "Foto vom Wasserschaden",
    );
    await expect(form).toContainText("schaden.jpg");
    // Taken once: the cache is empty again.
    expect(
      await page.evaluate(async () => (await (await caches.open("kontext-share")).keys()).length),
    ).toBe(0);
  });

  test("verwirft Geteiltes, ohne eine Mail zu öffnen", async ({ page }) => {
    await login(page);
    await page.evaluate(async () => {
      const cache = await caches.open("kontext-share");
      await cache.put(
        "/shared/s2/meta",
        Response.json({ title: "Fremd", text: "von einer anderen Seite", url: "", files: 0 }),
      );
    });
    await page.goto("/compose?shared=s2");
    await page.getByRole("button", { name: "Verwerfen" }).click();
    await expect(page.getByRole("region", { name: "Geteilt aus einer anderen App" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("form", { name: "Neue Mail" })).toHaveCount(0);
  });
});
