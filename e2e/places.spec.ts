/**
 * Place suggestions in an appointment's "Ort" and "In Karten öffnen". The server asks the stand-in
 * for Photon (dev/fake-places.ts, PLACES_URL in playwright.config.ts), not the internet.
 */
import { expect, type Page, test } from "@playwright/test";
import { login, unique } from "./helpers";

const tomorrow = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + 86_400_000),
  );
const PLACE = "Bäckerei Müller, Bahnhofstraße 2, 79312 Emmendingen";

const pickPlaceAndOpenIt = async (page: Page) => {
  const title = unique("Brötchen holen");
  await login(page);
  await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T07:00`);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill(title);
  const place = dialog.getByRole("combobox", { name: "Ort", exact: true });
  await place.pressSequentially("Bäckerei Müller");
  const suggestions = dialog.getByRole("listbox", { name: "Vorschläge für den Ort" });
  await expect(suggestions.getByRole("option")).toHaveCount(2);

  // Escape closes the list, the appointment stays open.
  await place.press("Escape");
  await expect(suggestions).toBeHidden();
  await expect(dialog).toBeVisible();

  await place.pressSequentially(" Emm");
  await suggestions.getByRole("option", { name: PLACE }).click();
  await expect(place).toHaveValue(PLACE);
  await expect(suggestions).toBeHidden();
  await dialog.getByRole("button", { name: "Speichern" }).click();

  await page.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
  const details = page.getByRole("dialog");
  await expect(details.getByText(PLACE)).toBeVisible();
  // Chrome on Linux and Android: Google Maps, which opens the maps app on a phone.
  await expect(details.getByRole("link", { name: "In Karten öffnen" })).toHaveAttribute(
    "href",
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(PLACE)}`,
  );
  await details.getByRole("button", { name: "Termin löschen", exact: true }).click();
};

test.describe("Ort eines Termins", () => {
  test("schlägt Orte vor und öffnet den Ort in Karten", async ({ page }) => {
    await pickPlaceAndOpenIt(page);
  });

  test("lässt freien Text ohne Vorschläge stehen", async ({ page }) => {
    await login(page);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T07:00`);
    const place = page.getByRole("dialog").getByRole("combobox", { name: "Ort", exact: true });
    await place.fill("Besprechungsraum 2");
    await expect(page.getByRole("listbox", { name: "Vorschläge für den Ort" })).toHaveCount(0);
    await expect(place).toHaveValue("Besprechungsraum 2");
  });
});

test.describe("Ort eines Termins am Handy @phone", () => {
  test("schlägt Orte vor und öffnet den Ort in Karten @phone", async ({ page }) => {
    await pickPlaceAndOpenIt(page);
  });
});
