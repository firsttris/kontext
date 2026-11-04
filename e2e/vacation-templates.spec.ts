import { expect, type Page, test } from "@playwright/test";
import { login } from "./helpers";

type Template = { title: string; text: string };

/**
 * Abwesenheitsvorlagen for this page only: the app's read and save are answered here (after
 * asking the real server, whose answer must be fine). At the server, the desktop and phone runs
 * would overwrite each other's list; its side is in server/company/routes.test.ts.
 */
const templatesHere = (page: Page) => {
  let templates: Template[] = [];
  return page.route("**/api/company/vacation-templates", async (route) => {
    if (route.request().method() === "PUT") {
      templates = (route.request().postDataJSON() as { templates: Template[] }).templates;
      return route.fulfill({ json: { templates } });
    }
    expect((await route.fetch()).ok()).toBe(true);
    await route.fulfill({ json: { templates } });
  });
};

/** The admin adds a Vorlage, then picks it for the own reply: filled, and not saved. */
const addAndPick = async (page: Page) => {
  await templatesHere(page);
  await login(page, "jonas");
  await page.goto("/settings?section=company-vacation");
  await page.getByRole("button", { name: "Vorlage hinzufügen" }).click();
  await page.getByLabel("Titel").fill("Urlaub");
  await page
    .getByLabel("Text", { exact: true })
    .fill("{Name} ist bis {Bis} nicht im Büro.\nIn dringenden Fällen: {Vertretung}.");
  await page.getByRole("button", { name: "Speichern" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();

  await page.goto("/settings?section=vacation");
  await page.getByLabel("Bis (optional)").fill("2030-12-18");
  await page.getByLabel("Vertretung").selectOption({ label: "Anna Weber" });
  // By role: a wrapping label's text takes in the options and the text, so no exact getByLabel.
  await page
    .getByRole("combobox", { name: "Vorlage", exact: true })
    .selectOption({ label: "Urlaub" });
  const message = page.getByRole("textbox", { name: "Nachricht", exact: true });
  await expect(message).toHaveValue(
    "Jonas Weber ist bis 18. Dezember 2030 nicht im Büro.\n" +
      "In dringenden Fällen: Anna Weber (anna@weber-haustechnik.test).",
  );
  // Another deputy fills the untouched Vorlage anew; without one, its line goes.
  await page.getByLabel("Vertretung").selectOption({ label: "Keine" });
  await expect(message).toHaveValue("Jonas Weber ist bis 18. Dezember 2030 nicht im Büro.");
  // The text stays free to edit.
  await message.fill("Bin ab dem 19. Dezember wieder da.");
  await expect(message).toHaveValue("Bin ab dem 19. Dezember wieder da.");
};

test.describe("Abwesenheitsvorlagen", () => {
  test("die Firmenverwaltung legt eine an, beim Einschalten füllt Kontext sie aus", async ({
    page,
  }) => {
    await addAndPick(page);
  });
});

test.describe("Abwesenheitsvorlagen am Handy @phone", () => {
  test("legt eine an und wählt sie für die eigene Abwesenheit @phone", async ({ page }) => {
    await addAndPick(page);
  });
});
