import { expect, type Page, test } from "@playwright/test";
import { DEV_PASSWORD } from "../dev/config";
import { startFakeSmtp } from "./fake-smtp";
import { addMail, address, inboxSubjects, login, unique } from "./helpers";

/**
 * Takes away the signed-in person's other mailboxes, so a failed try leaves nothing that keeps
 * fetching Max's mail into Anna's account for the tests after it.
 */
const removeExternalAccounts = async (page: Page) => {
  const response = await page.request.get("/api/external-accounts");
  if (!response.ok()) return;
  for (const { id } of (await response.json()) as { id: string }[]) {
    await page.request.delete(`/api/external-accounts/${id}`);
  }
};

/**
 * Anna keeps "another mailbox": Max's mailbox over the local Stalwart's IMAP stands in for Gmail
 * (no TLS in the tests), a stand-in SMTP server for Google's submission server.
 */
test("Weiteres Postfach: abrufen, als diese Adresse antworten, ohne Bcc versenden", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const smtp = await startFakeSmtp({ user: address("max"), password: DEV_PASSWORD });
  try {
    // Already in Max's inbox before connecting: stays there (only new mail comes over).
    const before = unique("Vorher im Postfach");
    await addMail("max", "max", before);

    await login(page, "anna");
    await removeExternalAccounts(page);
    await page.goto("/settings?section=accounts");
    await page.getByRole("button", { name: "Postfach hinzufügen" }).click();
    const dialog = page.getByRole("dialog", { name: "Postfach hinzufügen" });
    // The select's name includes the chosen option ("AnbieterGmail / Google"), and "Anbieter"
    // alone also matches the checkbox about the provider's inbox.
    await dialog
      .getByRole("combobox", { name: /^Anbieter/ })
      .selectOption({ label: "Anderer Server" });
    const servers = dialog.getByLabel("Port", { exact: true });
    await dialog.getByLabel("Posteingang (IMAP)", { exact: true }).fill("127.0.0.1");
    await servers.nth(0).fill("20143");
    await dialog.getByLabel("Postausgang (SMTP)", { exact: true }).fill("127.0.0.1");
    await servers.nth(1).fill(String(smtp.port));
    await dialog.getByLabel("E-Mail-Adresse", { exact: true }).fill(address("max"));
    await dialog.getByLabel("Passwort", { exact: true }).fill("falsch-falsch-falsch");
    await dialog.getByRole("button", { name: "Prüfen und verbinden" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Anmeldung abgelehnt");
    await dialog.getByLabel("Passwort", { exact: true }).fill(DEV_PASSWORD);
    await dialog.getByLabel("Absendername", { exact: true }).fill("Anna (privat)");
    await dialog.getByRole("button", { name: "Prüfen und verbinden" }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    const row = page.getByRole("listitem", { name: address("max") });
    await expect(row).toContainText("Abruf alle 2 Minuten", { timeout: 20_000 });

    // A new mail at the provider comes over on "Jetzt abrufen".
    const fresh = unique("Neu beim Anbieter");
    await addMail("max", "max", fresh);
    await row.getByRole("button", { name: "Jetzt abrufen" }).click();
    await expect.poll(() => inboxSubjects("anna"), { timeout: 20_000 }).toContain(fresh);
    expect(await inboxSubjects("anna")).not.toContain(before);

    // The answer goes out from the address the mail went to, through its server, without Bcc.
    await page.goto("/mail");
    await page.getByRole("list", { name: "Posteingang" }).getByText(fresh).click();
    await page.getByRole("link", { name: "Antworten" }).first().click();
    const sender = page.getByLabel("Von").locator("option:checked");
    await expect(sender).toHaveText(`Anna (privat) <${address("max")}>`);
    const replyUrl = page.url();
    await page.getByRole("button", { name: "Cc / Bcc" }).click();
    const bcc = page.getByRole("combobox", { name: "Bcc" });
    await bcc.fill("geheim@example.test");
    await bcc.press("Enter");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");

    await expect.poll(() => smtp.received.length, { timeout: 15_000 }).toBe(1);
    const [sent] = smtp.received;
    expect(sent!.from).toBe(address("max"));
    expect(sent!.to).toEqual(["erika@example.test", "geheim@example.test"]);
    expect(sent!.raw).toContain(`Re: ${fresh}`);
    expect(sent!.raw).not.toMatch(/^bcc:/im);

    await page.getByRole("link", { name: "Gesendet", exact: true }).click();
    await expect(
      page.getByRole("list", { name: "Gesendet" }).getByText(`Re: ${fresh}`),
    ).toBeVisible();

    // Opened straight from a link while the other mailboxes answer late: still that address.
    await page.route("**/api/external-accounts", async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.continue();
    });
    await page.goto(replyUrl);
    await expect(sender).toHaveText(`Anna (privat) <${address("max")}>`);
    await page.unroute("**/api/external-accounts");

    // Removing it ends fetching and sending as that address.
    await page.goto("/settings?section=accounts");
    await row.getByRole("button", { name: "Entfernen" }).click();
    await row.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(row).toBeHidden();
  } finally {
    await removeExternalAccounts(page).catch(() => undefined);
    await smtp.close();
  }
});
