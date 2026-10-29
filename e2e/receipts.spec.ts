import { expect, test } from "@playwright/test";
import { findMails, inboxSubjects, login, removeMails, unique } from "./helpers";
import { receiptInInbox, sentAskingReceipt } from "./read-receipt";

test.describe("Lesebestätigung", () => {
  test("anfordern, bestätigen, beim Absender sehen", async ({ page, browser }) => {
    const subject = unique("Freigabe Angebot Bad");
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    const to = page.getByRole("combobox", { name: "An" });
    await to.fill("max");
    await page.getByRole("option", { name: /Max Becker/ }).click();
    await page.getByLabel("Betreff").fill(subject);
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Bitte bis Freitag freigeben.");
    const receipt = page.getByRole("button", { name: "Lesebestätigung anfordern" });
    await receipt.click();
    await expect(receipt).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(() => inboxSubjects("max")).toContain(subject);

    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    await max.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    const asked = max.getByRole("note").filter({ hasText: "bittet um eine Lesebestätigung" });
    await expect(asked).toContainText("Jonas Weber");
    await asked.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(
      max.getByRole("status").filter({ hasText: "Lesebestätigung an Jonas Weber geschickt." }),
    ).toBeVisible();
    await expect(asked).toHaveCount(0);
    // Asked once: opened again, the question does not come back.
    await max.reload();
    await expect(max.getByRole("heading", { name: subject })).toBeVisible();
    await expect(max.getByText("bittet um eine Lesebestätigung")).toHaveCount(0);

    await page.getByRole("link", { name: "Gesendet", exact: true }).click();
    await page.getByRole("list", { name: "Gesendet" }).getByText(subject).click();
    await expect(page.getByRole("note").filter({ hasText: "Gelesen von Max Becker" })).toBeVisible({
      timeout: 15_000,
    });
    // The receipt itself is filed away: read, in the archive.
    await expect
      .poll(async () => {
        const found = await findMails("jonas", "jonas", [`Gelesen: ${subject}`]);
        return found.find((mail) => mail.subject === `Gelesen: ${subject}`)?.folder;
      })
      .toBe("archive");
    await max.context().close();
  });

  test("erkennt eine Bestätigung nur am Original-Message-ID und legt sie still ab", async ({
    page,
  }) => {
    const subject = unique("Freigabe Schaltplan");
    const stamp = Date.now().toString(36);
    const messageId = `freigabe.${stamp}@weber-haustechnik.test`;
    const receipt = unique("Read: Ihre Nachricht");
    const lookalike = unique("Read: Unbekannt");
    const petra = `petra.${stamp}@keller-elektro.test`;
    await sentAskingReceipt("jonas", {
      messageId,
      subject,
      to: petra,
      at: new Date(Date.now() - 5 * 60_000),
    });
    // Another subject, no In-Reply-To: only the report names the mail.
    await receiptInInbox("jonas", { from: petra, subject: receipt, original: messageId });
    // Looks like a receipt, but for no mail in Sent: it stays.
    await receiptInInbox("jonas", {
      from: petra,
      subject: lookalike,
      original: `unbekannt.${stamp}@example.test`,
    });
    try {
      await login(page);
      await expect
        .poll(async () =>
          (await findMails("jonas", "jonas", [receipt, lookalike]))
            .filter((mail) => mail.subject === receipt || mail.subject === lookalike)
            .map((mail) => [mail.subject, mail.folder, mail.keywords.join(",")])
            .sort(),
        )
        .toEqual([
          [receipt, "archive", "$seen"],
          [lookalike, "inbox", ""],
        ]);
      await page.getByRole("link", { name: "Gesendet", exact: true }).click();
      await page.getByRole("list", { name: "Gesendet" }).getByText(subject).click();
      await expect(
        page.getByRole("note").filter({ hasText: "Gelesen von Petra Keller" }),
      ).toBeVisible();
    } finally {
      await removeMails("jonas", "jonas", [subject, receipt, lookalike]);
    }
  });
});
