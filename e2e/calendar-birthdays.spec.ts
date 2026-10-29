import { expect, test } from "@playwright/test";
import { addBirthday, dayFromToday, login } from "./helpers";

test.describe("Geburtstage im Kalender", () => {
  test("zeigt den Geburtstag im Monat, führt zum Kontakt und lässt sich ausblenden", async ({
    page,
  }) => {
    const day = dayFromToday(5);
    const birthday = await addBirthday("Birte", day, 40);
    try {
      await login(page);
      await page.goto(`/calendar?view=month&date=${day}`);
      const cell = page.locator(`[data-month-day="${day}"]`);
      const chip = cell.getByRole("link", { name: `${birthday.name} (40)` });
      await expect(chip).toBeVisible();

      await chip.click();
      await expect(page).toHaveURL(/\/contacts\?/);
      await expect(page.getByRole("heading", { name: birthday.name })).toBeVisible();

      await page.goBack();
      const toggle = page.getByRole("checkbox", { name: "Geburtstage anzeigen" });
      await toggle.uncheck();
      await expect(cell.getByText(birthday.name)).toHaveCount(0);
      await page.reload();
      await expect(page.getByRole("checkbox", { name: "Geburtstage anzeigen" })).not.toBeChecked();
      await expect(cell.getByText(birthday.name)).toHaveCount(0);
      await page.getByRole("checkbox", { name: "Geburtstage anzeigen" }).check();
      await expect(chip).toBeVisible();
    } finally {
      await birthday.remove();
    }
  });

  test("am Handy: in der Liste, ohne Alter, wenn das Jahr fehlt @phone", async ({ page }) => {
    const day = dayFromToday(3);
    const birthday = await addBirthday("Bodo", day);
    try {
      await login(page);
      await page.goto(`/calendar?view=agenda&date=${day}`);
      const agenda = page.getByRole("list", { name: "Liste" });
      await expect(agenda.getByRole("link", { name: birthday.name, exact: false })).toBeVisible();
      await expect(agenda.getByText(birthday.name, { exact: true })).toBeVisible();

      await page.getByRole("button", { name: "Kalender verwalten" }).click();
      const dialog = page.getByRole("dialog", { name: "Kalender verwalten" });
      await dialog.getByRole("checkbox", { name: "Geburtstage anzeigen" }).uncheck();
      await dialog.getByRole("button", { name: /Schließen/ }).click();
      await expect(page.getByText(birthday.name)).toHaveCount(0);
    } finally {
      await birthday.remove();
    }
  });
});
