import { expect, type Page, test } from "@playwright/test";
import { addMail, address, findMail, login, removeMails, unique } from "./helpers";
import { deliverMail } from "./protocols";

/**
 * Blocks the sender of an inbox mail from "Weitere Aktionen"; the mail goes to Spam, and so does
 * the next one from there. Then the rule is removed in the settings.
 */
const blockAndUnblock = async (
  page: Page,
  user: string,
  sender: string,
  choice: string,
  blocked: string,
) => {
  const subject = unique("Sonderangebot");
  const next = unique("Noch ein Angebot");
  await addMail(user, user, subject, { name: "Angebote", email: sender });
  await login(page, user);
  try {
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await page.getByRole("button", { name: "Weitere Aktionen" }).click();
    await page.getByRole("menuitem", { name: "Absender blockieren" }).click();
    await page.getByRole("menuitem", { name: choice }).click();
    await expect(
      page.getByRole("status").filter({ hasText: `${blocked} blockiert.` }),
    ).toBeVisible();
    await expect.poll(() => findMail(user, subject)).toMatchObject({ folder: "junk" });

    await deliverMail({
      from: sender,
      fromName: "Angebote",
      to: address(user),
      subject: next,
      body: "Nur heute!",
    });
    await expect
      .poll(async () => (await findMail(user, next))?.folder, { timeout: 15_000 })
      .toBe("junk");

    await page.goto("/settings?section=rules");
    await page.getByRole("button", { name: new RegExp(`Blockiert: ${blocked}`) }).click();
    const dialog = page.getByRole("dialog", { name: "Regel bearbeiten" });
    await dialog.getByRole("button", { name: "Regel löschen" }).click();
    await dialog.getByRole("button", { name: "Wirklich löschen?" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Regel gelöscht." })).toBeVisible();
    await expect(page.getByText(`Blockiert: ${blocked}`)).toHaveCount(0);
  } finally {
    await removeMails(user, user, [subject, next]);
  }
};

const stamp = () => Date.now().toString(36);

test.describe("Absender blockieren", () => {
  test("blockiert eine Adresse; ihre Mails landen im Spam", async ({ page }) => {
    const sender = `werbung-${stamp()}@angebote.example`;
    await blockAndUnblock(page, "max", sender, `Nur ${sender}`, sender);
  });

  test("bietet Kollegen nicht zum Blockieren an", async ({ page }) => {
    const subject = unique("Frage zum Auftrag");
    await addMail("max", "max", subject, { name: "Anna", email: address("anna") });
    await login(page, "max");
    try {
      await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
      await page.getByRole("button", { name: "Weitere Aktionen" }).click();
      await expect(page.getByRole("menuitem", { name: "Regel erstellen …" })).toBeVisible();
      await expect(page.getByRole("menuitem", { name: "Absender blockieren" })).toHaveCount(0);
    } finally {
      await removeMails("max", "max", [subject]);
    }
  });
});

test.describe("Absender blockieren am Handy @phone", () => {
  test("blockiert eine ganze Domain @phone", async ({ page }) => {
    const domain = `werbung-${stamp()}.example`;
    await blockAndUnblock(page, "sandra", `info@${domain}`, `Alle von ${domain}`, domain);
  });
});
