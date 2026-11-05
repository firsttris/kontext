import { expect, type Page, test } from "@playwright/test";
import { addMail, address, attachedMails, findMails, login, removeMails, unique } from "./helpers";

/** Opens the mail from the inbox and picks „Als Phishing melden“ in „Weitere Aktionen“. */
const report = async (page: Page, subject: string) => {
  await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  await page.getByRole("menuitem", { name: "Als Phishing melden" }).click();
};

/** The original lies in Spam, the report address has it attached, and no copy stayed behind. */
const expectReported = async (to: string, subject: string) => {
  const reportSubject = `Phishing-Verdacht: ${subject}`;
  await expect
    .poll(async () => (await findMails("jonas", "jonas", [subject])).map((mail) => mail.folder))
    .toEqual(["junk"]);
  await expect.poll(() => attachedMails(to, reportSubject)).toEqual([subject]);
  // Neither in Sent nor in Drafts: the report is destroyed once it is submitted.
  expect(await findMails("jonas", "jonas", [reportSubject])).toEqual([]);
  await removeMails(to, to, [reportSubject]);
};

const setAddress = (page: Page, value: string) =>
  page.evaluate(async (body) => {
    const response = await fetch("/api/company/phishing-report", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address: body }),
    });
    if (!response.ok) throw new Error(`phishing-report: ${response.status}`);
  }, value);

test.describe("Als Phishing melden", () => {
  test("die Firmenverwaltung legt die Adresse fest, gemeldet geht die Mail als Anhang dorthin", async ({
    page,
  }) => {
    const subject = unique("Ihr Konto wird gesperrt");
    await addMail("jonas", "jonas", subject, { name: "Bank", email: "service@bank-sicher.test" });
    await login(page);
    try {
      // Without an address, the menu has no such item.
      await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
      await page.getByRole("button", { name: "Weitere Aktionen" }).click();
      await expect(page.getByRole("menuitem", { name: "Als Spam markieren" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Als Phishing melden" })).toHaveCount(0);
      await page.keyboard.press("Escape");

      await page.goto("/settings?section=company-security");
      await page.getByLabel("Adresse für Meldungen").fill(address("max"));
      await page.getByRole("button", { name: "Speichern" }).click();
      await expect(page.getByRole("status")).toHaveText("Gespeichert");

      await page.goto("/mail");
      await report(page, subject);
      await expect(page.getByRole("status")).toHaveText(
        `An ${address("max")} gemeldet und in den Spam verschoben.`,
      );
      await expect(page.getByRole("list", { name: "Posteingang" }).getByText(subject)).toHaveCount(
        0,
      );
      await expectReported("max", subject);
    } finally {
      await setAddress(page, "");
      await removeMails("jonas", "jonas", [subject]);
    }
  });

  test("meldet am Handy @phone", async ({ page }) => {
    // Answered here: the address at the server is the desktop test's, which runs beside this one.
    await page.route("**/api/company/phishing-report", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({ json: { address: address("anna") } })
        : route.fallback(),
    );
    const subject = unique("Paket konnte nicht zugestellt werden");
    await addMail("jonas", "jonas", subject, { name: "Paketdienst", email: "info@paket.test" });
    await login(page);
    try {
      await report(page, subject);
      await expect(page.getByRole("status")).toContainText(`An ${address("anna")} gemeldet`);
      await expectReported("anna", subject);
    } finally {
      await removeMails("jonas", "jonas", [subject]);
    }
  });
});
