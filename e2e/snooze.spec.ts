import { expect, type Page, test } from "@playwright/test";
import { addMail, inboxSubjects, login, unique } from "./helpers";

const openInInbox = async (page: Page, subject: string) => {
  await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
};

const snoozeUntilTomorrow = async (page: Page) => {
  await page.getByRole("button", { name: "Wiedervorlage" }).click();
  await page.getByRole("menuitem", { name: /^Morgen 08:00/ }).click();
  await expect(
    page.getByRole("status").filter({ hasText: /^Kommt .* 08:00 wieder\./ }),
  ).toBeVisible();
};

test.describe("Wiedervorlage", () => {
  test("legt eine Mail bis morgen zurück und holt sie von Hand wieder", async ({ page }) => {
    const subject = unique("Angebot nachfassen");
    await addMail("jonas", "jonas", subject);
    await login(page);
    await openInInbox(page, subject);
    await snoozeUntilTomorrow(page);
    const inbox = page.getByRole("list", { name: "Posteingang" });
    await expect(inbox.getByText(subject)).toHaveCount(0);

    // The folder appears with the first mail on it, with the time it comes back.
    await page.getByRole("link", { name: /^Wiedervorlage/ }).click();
    const row = page
      .getByRole("list", { name: "Wiedervorlage" })
      .getByRole("link", { name: new RegExp(subject) });
    await expect(row).toContainText(/Kommt .* 08:00 wieder/);
    await row.click();
    await expect(page.getByText(/^Liegt auf Wiedervorlage – kommt .* wieder/)).toBeVisible();
    await page.getByRole("button", { name: "Jetzt zurückholen" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Wieder im Posteingang." }),
    ).toBeVisible();
    await expect.poll(() => inboxSubjects("jonas")).toContain(subject);
  });

  test("„w“ öffnet die Auswahl, „Rückgängig“ legt die Mail zurück in den Ordner", async ({
    page,
  }) => {
    const subject = unique("Rückruf Hoffmann");
    await addMail("jonas", "jonas", subject);
    await login(page);
    await openInInbox(page, subject);
    await page.keyboard.press("w");
    await page.getByRole("menuitem", { name: /^In einer Woche 08:00/ }).click();
    const toast = page.getByRole("status").filter({ hasText: /^Kommt .* wieder\./ });
    await toast.getByRole("button", { name: "Rückgängig" }).click();
    await expect(page.getByRole("list", { name: "Posteingang" }).getByText(subject)).toBeVisible();
  });

  test("kommt zur Zeit von selbst ungelesen zurück, oben im Posteingang", async ({ page }) => {
    const subject = unique("Wartung bestätigen");
    await addMail("jonas", "jonas", subject);
    await login(page);
    await openInInbox(page, subject);
    const url = new URL(page.url());
    const accountId = decodeURIComponent(url.pathname.split("/")[2]!);
    const emailId = url.searchParams.get("email")!;
    await snoozeUntilTomorrow(page);

    // Tomorrow is long; the server's time is set to now, as "Anderer Zeitpunkt" would.
    const response = await page.request.put("/api/snoozes", {
      data: {
        accountId,
        emailIds: [emailId],
        until: new Date(Date.now() + 2000).toISOString(),
      },
    });
    expect(response.ok()).toBe(true);

    const inbox = page.getByRole("list", { name: "Posteingang" });
    await page.getByRole("link", { name: "Posteingang" }).first().click();
    const back = inbox.getByRole("listitem").filter({ hasText: "Wieder vorgelegt" });
    await expect(back).toContainText(subject, { timeout: 15_000 });
    await expect(inbox.getByRole("heading", { name: "Weitere Mails" })).toBeVisible();

    // Read, it takes its place by date again.
    await inbox.getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(inbox.getByRole("heading", { name: "Wieder vorgelegt" })).toHaveCount(0);
  });

  test("am Handy aus der offenen Mail zurücklegen @phone", async ({ page }) => {
    const subject = unique("Rechnung prüfen");
    await addMail("jonas", "jonas", subject);
    await login(page);
    await openInInbox(page, subject);
    await snoozeUntilTomorrow(page);
    await expect(page.getByRole("list", { name: "Posteingang" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Posteingang" }).getByText(subject)).toHaveCount(0);
  });
});
