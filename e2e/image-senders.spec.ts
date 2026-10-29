import { expect, type Page, test } from "@playwright/test";
import { login, unique } from "./helpers";
import { newsletter, pictureServer } from "./remote-pictures";

const open = async (page: Page, subject: string) => {
  await page.goto("/mail");
  await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
};

test.describe("Bilder je Absender", () => {
  test("„Immer von …“ lädt die Bilder dieses Absenders künftig sofort", async ({ page }) => {
    const pictures = await pictureServer();
    const first = unique("Herbstaktion");
    const second = unique("Winteraktion");
    await newsletter(first, pictures.url);
    await newsletter(second, pictures.url);
    await login(page, "max");

    await open(page, first);
    await expect(page.getByText("Bilder aus dem Internet sind blockiert.")).toBeVisible();
    expect(pictures.hits()).toBe(0);
    await page.getByRole("button", { name: "Immer von news@shop.example" }).click();
    await expect.poll(pictures.hits).toBeGreaterThan(0);

    const before = pictures.hits();
    await open(page, second);
    await expect(
      page.getByText("Bilder von news@shop.example werden immer geladen."),
    ).toBeVisible();
    await expect.poll(pictures.hits).toBeGreaterThan(before);

    // In the settings, and taken back there.
    await page.goto("/settings?section=security");
    const card = page.getByRole("region", { name: "Bilder aus dem Internet" });
    await expect(card.getByRole("list", { name: "Immer laden von" })).toContainText(
      "news@shop.example",
    );
    await card.getByRole("button", { name: "news@shop.example entfernen" }).click();
    await expect(card.getByRole("list", { name: "Immer laden von" })).toHaveCount(0);
    pictures.close();
  });
});
