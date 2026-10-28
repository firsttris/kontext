import { type Browser, expect } from "@playwright/test";
import { ADDRESS, closeAll, desktopOf } from "../screens";
import { startTake } from "../take";

/** Company admin: the employees, a new one with her own mailbox and access to info@. */
export const recordCompany = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const take = await startTake("company", { app: { page, kind: "desktop", label: ADDRESS } });
  await page.goto("/settings?section=employees");
  await expect(page.getByRole("main").getByText("Anna Weber")).toBeVisible();
  await take.hold("app", 1.0, { note: "Mitarbeiter anlegen – ohne IT-Kenntnisse" });
  const dialog = page.getByRole("dialog", { name: "Mitarbeiter anlegen" });
  await take.click("app", page.getByRole("button", { name: "Mitarbeiter anlegen" }), 0.6, {
    until: () => expect(dialog).toBeVisible(),
    focus: dialog,
    pad: 16,
    note: "Mitarbeiter anlegen – ohne IT-Kenntnisse",
  });
  await take.type("app", dialog.getByLabel("Name", { exact: true }), "Lena Schmid", {
    note: "Mitarbeiter anlegen – ohne IT-Kenntnisse",
  });
  await take.type("app", dialog.getByLabel("Name vor dem @"), "lena", {
    note: "Mitarbeiter anlegen – ohne IT-Kenntnisse",
  });
  await take.click("app", dialog.getByLabel("info@weber-haustechnik.test"), 0.9, {
    note: "Mit Zugang zu info@",
  });
  await take.click("app", dialog.getByRole("button", { name: "Anlegen" }), 2.0, {
    until: () => expect(dialog.getByTestId("new-password")).toBeVisible(),
    note: "Postfach, Kalender und Chat sind sofort da",
  });
  await take.save();
  await closeAll(page);
};
