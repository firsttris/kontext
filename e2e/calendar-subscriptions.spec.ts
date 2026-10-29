import { expect, type Page, test } from "@playwright/test";
import { login, unique } from "./helpers";
import { calendarOnTheWeb } from "./ics-server";

const manage = async (page: Page) => {
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
  return page.getByRole("dialog", { name: "Kalender verwalten" });
};

test.describe("Kalender abonnieren", () => {
  test("abonnieren, aktualisieren und beenden", async ({ page }) => {
    const web = await calendarOnTheWeb();
    const name = unique("Schulferien");
    const first = unique("Pädagogischer Tag");
    web.serve([first]);
    await login(page);
    const dialog = await manage(page);
    await dialog.getByLabel("Adresse des Kalenders").fill(web.url);
    await dialog.getByLabel("Name", { exact: true }).fill(name);
    await dialog.getByRole("button", { name: "Abonnieren" }).click();
    await expect(page.getByRole("status")).toHaveText("Kalender abonniert.");
    const list = dialog.getByRole("list", { name: "Kalender abonnieren" });
    await expect(list.getByText(name)).toBeVisible();
    await expect(list.getByText(/^Aktualisiert /)).toBeVisible();
    // It is a calendar of its own, shown like the others.
    await expect(dialog.getByLabel(`${name} anzeigen`)).toBeChecked();
    await page.keyboard.press("Escape");
    await page.goto("/calendar?view=agenda");
    await expect(page.getByRole("list", { name: "Liste" }).getByText(first)).toBeVisible();

    // The school changes its calendar; "Jetzt aktualisieren" takes it over.
    const changed = unique("Beweglicher Ferientag");
    web.serve([changed]);
    const again = await manage(page);
    await again.getByRole("button", { name: `Jetzt aktualisieren: ${name}` }).click();
    await expect(page.getByRole("status").last()).toHaveText("Kalender aktualisiert.");
    await page.keyboard.press("Escape");
    await page.goto("/calendar?view=agenda");
    await expect(page.getByRole("list", { name: "Liste" }).getByText(changed)).toBeVisible();
    await expect(page.getByRole("list", { name: "Liste" }).getByText(first)).toHaveCount(0);

    // Ending it takes the calendar with it.
    const last = await manage(page);
    page.once("dialog", (confirm) => void confirm.accept());
    await last.getByRole("button", { name: `Abo beenden: ${name}` }).click();
    await expect(last.getByText(name)).toHaveCount(0);
    web.close();
  });

  test("sagt, wenn unter der Adresse kein Kalender liegt @phone", async ({ page }) => {
    await login(page);
    const dialog = await manage(page);
    await dialog.getByLabel("Adresse des Kalenders").fill("http://127.0.0.1:9/nichts.ics");
    const name = unique("Falsch");
    await dialog.getByLabel("Name", { exact: true }).fill(name);
    await dialog.getByRole("button", { name: "Abonnieren" }).click();
    await expect(page.getByRole("alert")).toContainText("Der Kalender ist nicht erreichbar.");
    await expect(dialog.getByText(name, { exact: true })).toHaveCount(0);
  });
});
