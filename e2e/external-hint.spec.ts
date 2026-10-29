import { expect, type Page, test } from "@playwright/test";
import { addAttendees, address, externalHintOn, inboxSubjects, login, unique } from "./helpers";
import { copySeedMail } from "./own-mails";

const PETRA = "petra.keller@keller-elektro.test";

/** A new mail to `recipients` (chips), with a subject and a text, then "Senden". */
const write = async (page: Page, recipients: string[], subject: string, text: string) => {
  await page.getByRole("link", { name: "Neue Mail" }).first().click();
  const to = page.getByRole("combobox", { name: "An" });
  for (const recipient of recipients) {
    await to.fill(recipient);
    await to.press("Enter");
  }
  await page.getByLabel("Betreff").fill(subject);
  await page.getByRole("textbox", { name: "Ihre Nachricht …" }).fill(text);
  await page.getByRole("button", { name: "Senden", exact: true }).click();
};

type Hint = { enabled: boolean; partners: string[] };

/** The setting at the server, read and written through the app's own calls (cookie, origin). */
const hintAt = (page: Page) => ({
  read: () =>
    page.evaluate(async () => (await (await fetch("/api/company/external-hint")).json()) as Hint),
  write: (hint: Hint) =>
    page.evaluate(async (body) => {
      const response = await fetch("/api/company/external-hint", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`external-hint: ${response.status}`);
    }, hint),
});

test.describe("Hinweis „Extern“", () => {
  test("kennzeichnet Mails von außen, Partner nicht, und fragt vor dem Senden nach außen", async ({
    page,
  }) => {
    await externalHintOn(page, { partners: ["braun-steuer.test"] });
    // Copies of the seed's mails, on top of the inbox (own-mails.ts).
    const offer = await copySeedMail("jonas", "angebot-wartung@keller-elektro.test");
    const tax = await copySeedMail("jonas", "rueckfrage-steuer@braun-steuer.test");
    try {
      await login(page);
      const list = page.getByRole("list", { name: "Posteingang" });
      const line = (subject: string) => list.getByRole("link").filter({ hasText: subject });
      await expect(line(offer.subject)).toContainText("Extern");
      // Kanzlei Braun is a partner, Anna a colleague.
      const partner = line(tax.subject);
      await expect(partner).toBeVisible();
      await expect(partner).not.toContainText("Extern");

      await line(offer.subject).click();
      await expect(page.locator("article header")).toContainText("Extern");

      // "Anhang vergessen?" first, then the question about outside, one after the other.
      await write(page, [address("max"), PETRA], unique("Termin"), "Anbei der Plan.");
      await page
        .getByRole("dialog", { name: "Anhang vergessen?" })
        .getByRole("button", { name: "Ohne Anhang senden" })
        .click();
      const ask = page.getByRole("dialog", { name: "An externe Empfänger senden?" });
      await expect(ask).toContainText(PETRA);
      await expect(ask).not.toContainText(address("max"));
      await ask.getByRole("button", { name: "Zurück" }).click();
      await expect(ask).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Senden", exact: true })).toBeVisible();
      await expect(page.getByRole("status")).toHaveCount(0);
    } finally {
      await offer.remove();
      await tax.remove();
    }
  });

  test("sendet nach der Rückfrage, und fragt vor einer Einladung nach außen", async ({ page }) => {
    // Max counts as outside here (the company's domain is left out), so the mail sent after the
    // answer arrives in a mailbox the test can read, and nothing leaves the test server.
    await externalHintOn(page, { domains: [], partners: [] });
    await login(page);
    const subject = unique("Rückfrage Lieferung");
    await write(page, [address("max")], subject, "Passt Freitag?");
    const ask = page.getByRole("dialog", { name: "An externe Empfänger senden?" });
    await expect(ask).toContainText(address("max"));
    await ask.getByRole("button", { name: "Trotzdem senden" }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(() => inboxSubjects("max")).toContain(subject);

    const day = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await page.goto(`/calendar?date=${day}&event=new&start=${day}T10:00`);
    const editor = page.getByRole("dialog", { name: "Neuer Termin" });
    await editor.getByLabel("Titel").fill(unique("Baubesprechung"));
    await addAttendees(editor, PETRA);
    await editor.getByRole("button", { name: "Speichern" }).click();
    const invite = page.getByRole("dialog", { name: "An externe Empfänger senden?" });
    await expect(invite).toContainText("Die Einladung geht auch an Teilnehmer außerhalb");
    await expect(invite).toContainText(PETRA);
    await invite.getByRole("button", { name: "Zurück" }).click();
    await expect(editor).toBeVisible();
    await editor.getByRole("button", { name: "Abbrechen" }).click();
  });

  test("lässt die Firmenverwaltung Partner-Domains eintragen und den Hinweis einschalten", async ({
    page,
  }) => {
    await login(page);
    const server = hintAt(page);
    const before = await server.read();
    const partner = `partner-${Date.now().toString(36)}.test`;
    try {
      await page.goto("/settings?section=company-external");
      await expect(page.getByRole("heading", { name: "Externe Empfänger" })).toBeVisible();
      await expect(
        page.getByText(/Als intern gelten die eigenen Domains: .*weber-haustechnik/),
      ).toBeVisible();
      const partners = page.getByLabel("Partner-Domains");
      await partners.fill("kein-domain");
      await expect(page.getByRole("alert")).toHaveText("Keine gültige Domain: kein-domain");
      await expect(page.getByRole("button", { name: "Speichern" })).toBeDisabled();
      // Saved for real while the hint stays off: the partners alone change nothing for anyone.
      await partners.fill([...before.partners, `@${partner.toUpperCase()}`].join("\n"));
      await page.getByRole("button", { name: "Speichern" }).click();
      await expect(page.getByRole("status")).toHaveText("Gespeichert.");
      await page.reload();
      await expect(page.getByLabel("Partner-Domains")).toHaveValue(new RegExp(partner));
      expect((await server.read()).enabled).toBe(false);

      // Switching on is answered here, not by the server: the tests beside this one must not see
      // it on. What the page asks for is what counts.
      let sent: Hint | null = null;
      await page.route("**/api/company/external-hint", async (route) => {
        if (route.request().method() !== "PUT") return route.fallback();
        sent = route.request().postDataJSON() as Hint;
        await route.fulfill({ json: sent });
      });
      await page.getByRole("switch", { name: "Hinweis „Extern“ einschalten" }).click();
      await page.getByRole("button", { name: "Speichern" }).click();
      await expect
        .poll(() => sent)
        .toEqual({ enabled: true, partners: expect.arrayContaining([partner]) });
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await server.write(before);
    }
  });
});
