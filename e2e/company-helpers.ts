/** Steps the Firmenverwaltung tests share. */
import type { Page } from "@playwright/test";
import { address, skipTour } from "./helpers";

export const stamp = () => Date.now().toString(36);

/** Signs in with a password shown in the Firmenverwaltung; "ok" or the login page's alert. */
export const signInWith = async (page: Page, email: string, password: string) => {
  await skipTour(page, email);
  await page.goto("/login");
  await page.getByLabel("E-Mail-Adresse").fill(email);
  await page.getByLabel("Passwort").fill(password);
  await page.getByRole("button", { name: "Anmelden" }).click();
};

export const newEmployee = async (
  page: Page,
  local: string,
  fullName: string,
  mailbox?: string,
) => {
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
