import { expect, type Page, test } from "@playwright/test";
import { addMail, findMails, inboxSubjects, login, removeMails, unique } from "./helpers";

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

const pick = (page: Page, subject: string) =>
  page.getByRole("checkbox", { name: `„${subject}“ auswählen` });

/** Sets the time of mails on Wiedervorlage to now, as "Anderer Zeitpunkt" would. */
const dueNow = async (page: Page, mails: { accountId: string; id: string }[]) => {
  for (const { accountId, id } of mails) {
    const response = await page.request.put("/api/snoozes", {
      data: { accountId, emailIds: [id], until: new Date(Date.now() + 2000).toISOString() },
    });
    expect(response.ok()).toBe(true);
  }
};

test.describe("Wiedervorlage für mehrere Mails", () => {
  test("legt Mails aus zwei Postfächern zurück, „Wieder vorgelegt“ in Alle Posteingänge", async ({
    page,
  }) => {
    const own = unique("Viele zurück eigen");
    const shared = unique("Viele zurück info");
    await addMail("jonas", "jonas", own);
    await addMail("jonas", "info", shared);
    try {
      await login(page);
      await page.getByRole("link", { name: "Alle Posteingänge" }).click();
      await pick(page, own).click();
      await pick(page, shared).click();
      await page.getByRole("button", { name: "Wiedervorlage" }).click();
      await page.getByRole("menuitem", { name: /^Morgen 08:00/ }).click();
      await expect(
        page.getByRole("status").filter({ hasText: /^2 Mails kommen .* 08:00 wieder\./ }),
      ).toBeVisible();
      const list = page.getByRole("list", { name: "Alle Posteingänge" });
      await expect(list.getByText(own)).toHaveCount(0);
      await expect(list.getByText(shared)).toHaveCount(0);
      const put = async () => [
        ...(await findMails("jonas", "jonas", [own])),
        ...(await findMails("jonas", "info", [shared])),
      ];
      await expect
        .poll(async () => (await put()).map((mail) => mail.folder))
        .toEqual(["snoozed", "snoozed"]);

      // Both come back: on top of the combined list, own and shared alike.
      await dueNow(page, await put());
      const back = list.getByRole("listitem").filter({ hasText: "Wieder vorgelegt" });
      await expect(back).toContainText(own, { timeout: 15_000 });
      await expect(list.getByRole("heading", { name: "Wieder vorgelegt" })).toHaveCount(1);
      await expect(list.getByRole("heading", { name: "Weitere Mails" })).toBeVisible();
      // Both above the rest, whichever account they came back to.
      const onTop = async () => {
        const items = await list.getByRole("listitem").allInnerTexts();
        const rest = items.findIndex((text) => text.includes("Weitere Mails"));
        const at = (subject: string) => items.findIndex((text) => text.includes(subject));
        return [at(own) >= 0 && at(own) < rest, at(shared) >= 0 && at(shared) < rest];
      };
      await expect.poll(onTop).toEqual([true, true]);
    } finally {
      await removeMails("jonas", "jonas", [own]);
      await removeMails("jonas", "info", [shared]);
    }
  });

  test("am Handy zwei ausgewählte Mails zurücklegen @phone", async ({ page }) => {
    const subjects = [unique("Handy später 1"), unique("Handy später 2")];
    for (const subject of subjects) await addMail("max", "max", subject);
    try {
      await login(page, "max");
      await page.getByRole("button", { name: "Auswählen" }).click();
      for (const subject of subjects) await pick(page, subject).click();
      await page.getByRole("button", { name: "Wiedervorlage" }).click();
      await page.getByRole("menuitem", { name: /^In einer Woche 08:00/ }).click();
      await expect
        .poll(async () => (await findMails("max", "max", subjects)).map((mail) => mail.folder))
        .toEqual(["snoozed", "snoozed"]);
    } finally {
      await removeMails("max", "max", subjects);
    }
  });
});
