import { expect, type Page, test } from "@playwright/test";
import { address, login } from "./helpers";

const stamp = () => Date.now().toString(36);

/** Signs in with a password shown in the Firmenverwaltung; "ok" or the login page's alert. */
const signInWith = async (page: Page, email: string, password: string) => {
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
};

const newEmployee = async (page: Page, local: string, fullName: string, mailbox?: string) => {
  await page.goto("/settings?section=employees");
  await page.getByRole("button", { name: "Mitarbeiter anlegen" }).click();
  const dialog = page.getByRole("dialog", { name: "Mitarbeiter anlegen" });
  await dialog.getByLabel("Name", { exact: true }).fill(fullName);
  await dialog.getByLabel("Name vor dem @").fill(local);
  if (mailbox) await dialog.getByLabel(address(mailbox)).check();
  await dialog.getByRole("button", { name: "Anlegen" }).click();
  const password = (await dialog.getByTestId("new-password").textContent()) ?? "";
  await dialog.getByRole("button", { name: "Fertig" }).click();
  return password;
};

test.describe("Firmenverwaltung", () => {
  test("nur mit dem Recht sichtbar", async ({ page }) => {
    await login(page, "anna");
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Darstellung" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mitarbeiter" })).toHaveCount(0);
    await page.goto("/settings?section=employees");
    await expect(page.getByText("nur für Konten mit dem Recht")).toBeVisible();
  });

  test("legt einen Mitarbeiter an, der sich anmeldet, und sperrt ihn wieder", async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    const local = `azubi-${stamp()}`;
    await login(page, "jonas");
    const password = await newEmployee(page, local, "Paul Azubi", "info");
    expect(password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    await expect(page.getByRole("button", { name: /Paul Azubi/ })).toBeVisible();

    const paul = await (await browser.newContext()).newPage();
    await signInWith(paul, address(local), password);
    await expect(paul).toHaveURL(/\/mail\//);
    await expect(paul.getByRole("link", { name: /^info@/ }).first()).toBeVisible();

    await page.getByRole("button", { name: /Paul Azubi/ }).click();
    const dialog = page.getByRole("dialog", { name: "Mitarbeiter bearbeiten" });
    await dialog.getByRole("button", { name: "Zugang sperren" }).click();
    await dialog.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ist gesperrt" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Paul Azubi.*Gesperrt/ })).toBeVisible();

    // signed out everywhere, and no new sign-in
    await paul.reload();
    await expect(paul).toHaveURL(/\/login/);
    await signInWith(paul, address(local), password);
    await expect(paul.getByRole("alert")).toBeVisible();
  });

  test("gemeinsames Postfach mit Mitgliedern und weiterer Adresse", async ({ page }) => {
    const local = `service-${stamp()}`;
    await login(page, "jonas");
    await page.goto("/settings?section=mailboxes");
    await page.getByRole("button", { name: "Postfach anlegen" }).click();
    let dialog = page.getByRole("dialog", { name: "Postfach anlegen" });
    await dialog.getByLabel("Name vor dem @").fill(local);
    await dialog.getByLabel("Bezeichnung").fill("Kundendienst");
    await dialog.getByLabel("Zugriff für Sandra Klein").selectOption("Lesen und senden");
    await dialog.getByLabel("Zugriff für Max Becker").selectOption("Lesen und senden");
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    const row = page.getByRole("button", { name: new RegExp(`${local}@`) });
    await expect(row).toContainText("Max, Sandra");

    await row.click();
    dialog = page.getByRole("dialog", { name: "Postfach bearbeiten" });
    await dialog
      .getByLabel("Adresse hinzufügen")
      .first()
      .fill(`kd-${local}@weber-haustechnik.test`);
    await dialog.getByLabel("Adresse hinzufügen").first().press("Enter");
    await dialog.getByLabel("Zugriff für Max Becker").selectOption("Kein Zugriff");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(row).toContainText("Sandra");
    await expect(row).not.toContainText("Max");

    // a foreign domain is refused with the server's reason
    await row.click();
    await dialog.getByLabel("Adresse hinzufügen").first().fill("kd@gmail.com");
    await dialog.getByLabel("Adresse hinzufügen").first().press("Enter");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByRole("alert")).toContainText("gmail.com");
  });

  test("setzt am Handy ein Passwort zurück @phone", async ({ page, browser }) => {
    test.setTimeout(60_000);
    const local = `aushilfe-${stamp()}`;
    await login(page, "jonas");
    await newEmployee(page, local, "Lisa Aushilfe");
    await page.goto("/settings");
    await page.getByRole("link", { name: "Mitarbeiter" }).click();
    await page.getByRole("button", { name: /Lisa Aushilfe/ }).click();
    const dialog = page.getByRole("dialog", { name: "Mitarbeiter bearbeiten" });
    await dialog.getByRole("button", { name: "Passwort zurücksetzen" }).click();
    await dialog.getByRole("button", { name: "Ja, weiter" }).click();
    const password = (await dialog.getByTestId("new-password").textContent()) ?? "";

    const lisa = await (await browser.newContext()).newPage();
    await signInWith(lisa, address(local), password);
    await expect(lisa).toHaveURL(/\/mail\//);
  });

  test("gibt ein gemeinsames Postfach nur zum Lesen frei", async ({ page, browser }) => {
    await login(page, "jonas");
    await page.goto("/settings?section=mailboxes");
    await page.getByRole("button", { name: /^rechnung@/ }).click();
    const dialog = page.getByRole("dialog", { name: "Postfach bearbeiten" });
    await dialog.getByLabel("Zugriff für Max Becker").selectOption("Nur lesen");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("button", { name: /^rechnung@/ })).toContainText("nur lesen: Max");

    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    await max.getByRole("link", { name: "rechnung@" }).click();
    await max
      .getByRole("list", { name: "Posteingang" })
      .getByText("Rechnung 2026-117")
      .first()
      .click();
    await expect(max.getByRole("heading", { name: "Rechnung 2026-117" })).toBeVisible();
    await expect(max.getByRole("button", { name: "Löschen" })).toHaveCount(0);

    // and back, so the other tests see Max without rechnung@
    await page.getByRole("button", { name: /^rechnung@/ }).click();
    await dialog.getByLabel("Zugriff für Max Becker").selectOption("Kein Zugriff");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("button", { name: /^rechnung@/ })).not.toContainText("Max");
  });

  test("trägt die Abwesenheit eines Kollegen mit Vertretung ein", async ({ page }) => {
    const local = `krank-${stamp()}`;
    await login(page, "jonas");
    await newEmployee(page, local, "Tom Krank");
    await page.getByRole("button", { name: /Tom Krank/ }).click();
    await page.getByRole("button", { name: "Abwesenheit eintragen" }).click();
    const dialog = page.getByRole("dialog", { name: "Abwesenheit von Tom Krank" });
    await dialog.getByLabel("Abwesenheitsnotiz einschalten").check();
    await dialog.getByLabel("Vertretung").selectOption({ label: "Anna Weber" });
    await dialog.getByLabel("Betreff").fill("Nicht im Büro");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Abwesenheit gespeichert" }),
    ).toBeVisible();

    const id = (await page.request.get("/api/company").then((r) => r.json())).employees.find(
      (e: { email: string }) => e.email === address(local),
    ).id;
    const vacation = await page.request
      .get(`/api/company/employees/${id}/vacation`)
      .then((r) => r.json());
    expect(vacation).toMatchObject({ isEnabled: true, subject: "Nicht im Büro" });
    expect(vacation.textBody).toContain("Anna Weber (anna@weber-haustechnik.test)");
  });
});
