import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";

test.describe("Kontakte", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kontakte" }).first().click();
  });

  test("zeigt einen Kontakt mit Mails und Termin und schreibt ihm", async ({ page }) => {
    await page.getByRole("link", { name: /Markus Hoffmann/ }).click();
    await expect(page.getByRole("heading", { name: "Markus Hoffmann" })).toBeVisible();
    await expect(page.getByText("Re: Badsanierung Obergeschoss")).toBeVisible();
    await expect(page.getByRole("link", { name: /Baubesprechung Hoffmann/ })).toBeVisible();
    await page.getByRole("link", { name: "Mail schreiben" }).click();
    await expect(
      page.getByRole("form", { name: "Neue Mail" }).getByText("Markus Hoffmann"),
    ).toBeVisible();
  });

  test("sucht", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Kontakte suchen" }).fill("elektro");
    await expect(page.getByRole("link", { name: /Petra Keller/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Markus Hoffmann/ })).toHaveCount(0);
  });

  test("legt an, ändert und löscht", async ({ page }) => {
    const surname = unique("Fischer");
    await page.getByRole("link", { name: "Neuer Kontakt" }).click();
    await page.getByLabel("Vorname").fill("Eva");
    await page.getByLabel("Nachname").fill(surname);
    await page.getByLabel("Firma").fill("Fischer Bau");
    await page.getByLabel("E-Mail").fill("eva@fischer-bau.test");
    await page.getByLabel("Telefon").fill("+49 7223 4711");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("heading", { name: `Eva ${surname}` })).toBeVisible();
    await expect(page.getByText("eva@fischer-bau.test")).toBeVisible();

    await page.getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByLabel("Telefon").fill("+49 7223 4712");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("+49 7223 4712")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByRole("button", { name: "Kontakt löschen" }).click();
    await expect(page.getByRole("link", { name: new RegExp(surname) })).toHaveCount(0);
  });

  test("verlangt einen Namen", async ({ page }) => {
    await page.getByRole("link", { name: "Neuer Kontakt" }).click();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("alert")).toHaveText("Bitte einen Namen angeben.");
  });

  test("schlägt Kontakte beim Schreiben vor", async ({ page }) => {
    await page.getByRole("link", { name: "Mail" }).first().click();
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("kel");
    await expect(page.getByRole("option", { name: /Petra Keller/ })).toBeVisible();
  });
});

test.describe("Kontakte am Handy @phone", () => {
  test("Liste und Kontakt", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kontakte" }).click();
    await page.getByRole("link", { name: /Petra Keller/ }).click();
    await expect(page.getByRole("heading", { name: "Petra Keller" })).toBeVisible();
    await page.getByRole("link", { name: "Kontakte", exact: true }).first().click();
    await expect(page.getByRole("searchbox", { name: "Kontakte suchen" })).toBeVisible();
  });
});
