import { type Browser, expect } from "@playwright/test";
import { say, ui } from "../language";
import { ADDRESS, closeAll, desktopOf } from "../screens";
import { startTake } from "../take";

/** Company admin: the employees, a new one with her own mailbox and access to info@. */
export const recordCompany = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const take = await startTake("company", { app: { page, kind: "desktop", label: ADDRESS } });
  await page.goto("/settings?section=employees");
  await expect(page.getByRole("main").getByText("Anna Weber")).toBeVisible();
  const note = say(
    "Mitarbeiter anlegen – ohne IT-Kenntnisse",
    "Add an employee – no IT skills needed",
  );
  await take.hold("app", 1.0, { note });
  const dialog = page.getByRole("dialog", { name: ui("company_employee_new") });
  const add = page.getByRole("button", { name: ui("company_employee_new") });
  await take.click("app", add, 0.6, {
    until: () => expect(dialog).toBeVisible(),
    focus: dialog,
    pad: 16,
    note,
  });
  await take.type("app", dialog.getByLabel(ui("company_name"), { exact: true }), "Lena Schmid", {
    note,
  });
  await take.type("app", dialog.getByLabel(ui("company_email_local")), "lena", { note });
  await take.click("app", dialog.getByLabel("info@weber-haustechnik.test"), 0.9, {
    note: say("Mit Zugang zu info@", "With access to info@"),
  });
  await take.click("app", dialog.getByRole("button", { name: ui("company_create") }), 2.0, {
    until: () => expect(dialog.getByTestId("new-password")).toBeVisible(),
    note: say(
      "Postfach, Kalender und Chat sind sofort da",
      "Mailbox, calendar and chat are there at once",
    ),
  });
  await take.save();
  await closeAll(page);
};
