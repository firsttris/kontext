import { expect, type Page, test } from "@playwright/test";
import { fillDemo } from "./demo-data";
import { addAttendees, addMail, address, login } from "./helpers";
import { deliverInvitation } from "./invitation-mail";
import { pairBox } from "./paired-box";
import { giveKey } from "./pgp-key";

/**
 * The pictures in the README and the docs. Run with `bun run screenshots`. The pointer goes to
 * an empty corner first, so no row shows its hover state (the box to pick it).
 */
const shot = async (page: Page, name: string, alsoFor?: "wide" | "narrow") => {
  const size = page.viewportSize();
  if (size) await page.mouse.move(size.width - 2, size.height - 2);
  await page.screenshot({ path: `docs/screenshots/${name}.png`, animations: "disabled" });
  // The same picture for the app's install dialog (manifest screenshots, vite.config.ts).
  if (alsoFor) {
    await page.screenshot({ path: `public/screenshots/${alsoFor}.png`, animations: "disabled" });
  }
};

/** The open mail is drawn: its text, and the thumbnails of its attachments (pdf.js takes a moment). */
const mailShown = async (page: Page) => {
  await expect(page.frameLocator("iframe").getByText("Viele Grüße")).toBeVisible();
  const attachments = page.getByRole("list", { name: "Anhänge" });
  if (await attachments.count()) await expect(attachments.locator("img").first()).toBeVisible();
};

const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

test.describe("Screenshots @screenshots", () => {
  test("Desktop", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await mailShown(page);
    await shot(page, "mail", "wide");

    await page.getByRole("link", { name: /Antworten an Petra/ }).click();
    await expect(page.getByLabel("Betreff")).toHaveValue(/Re:/);
    await shot(page, "compose");

    await page.getByRole("link", { name: "info@" }).click();
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Anfrage Wärmepumpe Neubau")
      .click();
    await mailShown(page);
    await shot(page, "shared-mailbox");

    await page.goto("/calendar");
    await expect(
      page.locator(`[data-day="${today()}"]`).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
    await shot(page, "calendar");

    await page.goto("/contacts");
    await page.getByRole("link", { name: /Markus Hoffmann/ }).click();
    await expect(page.getByText("Re: Badsanierung Obergeschoss")).toBeVisible();
    await shot(page, "contacts");
  });

  test("Dunkel", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      colorScheme: "dark",
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const page = await context.newPage();
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await mailShown(page);
    await shot(page, "mail-dark");
    await page.goto("/calendar");
    await expect(
      page.locator(`[data-day="${today()}"]`).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
    await shot(page, "calendar-dark");
    await context.close();
  });

  test("Einladung in der Mail", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await deliverInvitation(address("jonas"), {
      uid: crypto.randomUUID(),
      title: "Abstimmung Elektroplanung Neubau",
    });
    await page.reload();
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Einladung: Abstimmung Elektroplanung Neubau")
      .first()
      .click();
    await expect(page.getByRole("region", { name: "Einladung" })).toContainText(
      "Noch nicht beantwortet",
    );
    await shot(page, "mail-invitation");
  });

  test("Angaben für die Signatur", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/settings?section=profile");
    const card = page.getByRole("region", { name: "Angaben für die Signatur" });
    await card.getByLabel("Position").fill("Geschäftsführer");
    await card.getByLabel("Abteilung").fill("Kundendienst");
    await card.getByLabel("Telefon").fill("07223 4711-10");
    await card.getByLabel("Mobil").fill("0170 1234567");
    await card.scrollIntoViewIfNeeded();
    await shot(page, "signature-details");
  });

  test("Papierkorb leeren", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    // Something in the Papierkorb: a mail of its own, so the other pictures keep the seed's.
    await addMail("jonas", "jonas", "Newsletter: Frühjahrsaktion Solarthermie", {
      name: "Großhandel Richter",
      email: "newsletter@richter-sanitaer.test",
    });
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Newsletter: Frühjahrsaktion Solarthermie")
      .click();
    await page.getByRole("button", { name: "Löschen" }).first().click();
    await page.getByRole("link", { name: "Papierkorb" }).click();
    await page.getByRole("button", { name: "Papierkorb leeren" }).click();
    await expect(page.getByRole("dialog", { name: "Papierkorb leeren?" })).toBeVisible();
    await shot(page, "empty-trash");
  });

  test("Anhang vergessen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("petra");
    await page.getByRole("option", { name: /Petra Keller/ }).click();
    await page.getByLabel("Betreff").fill("Angebot Wartungsvertrag 2027");
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Hallo Frau Keller, anbei unser Angebot für den Wartungsvertrag.");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Anhang vergessen?" })).toBeVisible();
    await shot(page, "forgotten-attachment");
  });

  test("Erinnerung am Termin", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto(`/calendar?event=new&start=${today()}T14:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill("Wartung Heizung Becker");
    await dialog.getByLabel("Ort").fill("Lindenweg 12, Bühl");
    await dialog.getByLabel("Erinnerung").selectOption({ label: "1 Tag vorher" });
    await dialog.getByLabel("Erinnern per").selectOption({ label: "Mail" });
    await dialog.getByLabel("Erinnerung").scrollIntoViewIfNeeded();
    await shot(page, "event-reminder");
  });

  test("Serie ab einem Termin ändern", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto(`/calendar?date=${today()}&view=agenda`);
    await page.getByRole("list", { name: "Liste" }).getByText("Teambesprechung").nth(1).click();
    await page.getByRole("dialog").getByRole("button", { name: "Bearbeiten" }).click();
    await page.getByRole("dialog").getByLabel("Dieser und alle folgenden").check();
    await shot(page, "series-following");
  });

  test("Handy", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const page = await context.newPage();
    await login(page);
    await expect(page.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
    await shot(page, "phone-mail", "narrow");
    await page.getByText("Angebot Wartungsvertrag 2027").click();
    await mailShown(page);
    await shot(page, "phone-read");
    await page.goto("/calendar");
    await expect(page.getByText("Baubesprechung Hoffmann")).toBeVisible();
    await shot(page, "phone-calendar");
    await context.close();
  });

  test("Wischen am Handy", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const page = await context.newPage();
    await login(page);
    const line = page.getByRole("link", { name: /Angebot Wartungsvertrag 2027/ });
    await expect(line).toBeVisible();
    const at = (await line.boundingBox())!;
    const y = at.y + at.height / 2;
    const x = at.x + at.width - 40;
    // A finger halfway through a swipe to the left: held there for the picture, then let go of
    // as a cancel, so the mail stays.
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let step = 1; step <= 8; step++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: x - step * 20, y }],
      });
    }
    await expect(page.locator("[data-swipe=archive]")).toBeVisible();
    await shot(page, "phone-swipe");
    await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
    await context.close();
  });

  test("Verfügbarkeit, Vertraulich, Firma", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const page = await context.newPage();
    await login(page);

    await page.goto(`/calendar?date=${today()}&event=new&start=${today()}T10:00`);
    const meeting = page.getByRole("dialog");
    await meeting.getByLabel("Titel").fill("Abnahme Badsanierung Hoffmann");
    await addAttendees(meeting, "anna@weber-haustechnik.test, sandra@weber-haustechnik.test");
    await expect(meeting.getByRole("region", { name: "Verfügbarkeit" })).toBeVisible();
    await shot(page, "availability");

    // "Vertraulich senden" needs the sender's own key (as in e2e/secure.spec.ts).
    await giveKey(page, "jonas");
    await page.goto("/mail");
    // From the customer's folder, so the list beside it shows his mails.
    await page.getByRole("link", { name: "Hoffmann", exact: true }).click();
    await expect(page.getByText("Re: Badsanierung Obergeschoss").first()).toBeVisible();
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("markus.hoffmann@example.test");
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill("Ihre Rechnung Badsanierung");
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Guten Tag Herr Hoffmann,\n\nanbei Ihre Rechnung über die Badsanierung.");
    await page.getByRole("button", { name: "Vertraulich senden" }).click();
    await expect(page.getByRole("status").filter({ hasText: "per Link mit Code" })).toBeVisible();
    await shot(page, "confidential");

    await page.goto("/settings?section=employees");
    await expect(page.getByRole("main").getByText("Anna Weber")).toBeVisible();
    await shot(page, "settings-employees");
    await context.close();
  });

  test("Aufgaben und Chat", async ({ browser }) => {
    const { channelId, infoBoard } = await fillDemo(browser);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const page = await context.newPage();
    await login(page);
    await page.goto("/tasks");
    await expect(page.getByText("Baubesprechung Hoffmann vorbereiten")).toBeVisible();
    await shot(page, "tasks");
    await page.goto(`/tasks?board=${encodeURIComponent(infoBoard)}&mode=board`);
    await expect(page.getByText("Angebot Wärmepumpe Lang erstellen")).toBeVisible();
    await shot(page, "tasks-board");
    await page.goto(`/chat?channel=${encodeURIComponent(channelId)}`);
    await expect(
      page.getByRole("list", { name: "Nachrichten" }).getByText("Passt, ich messe morgen früh"),
    ).toBeVisible();
    await shot(page, "chat");
    await context.close();

    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      locale: "de-DE",
      timezoneId: "Europe/Berlin",
    });
    const handy = await phone.newPage();
    await login(handy);
    await handy.goto(`/chat?channel=${encodeURIComponent(channelId)}`);
    await expect(
      handy.getByRole("list", { name: "Nachrichten" }).getByText("Passt, ich messe morgen früh"),
    ).toBeVisible();
    await shot(handy, "phone-chat");
    await phone.close();
  });

  test("Telefonie", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    const box = await pairBox(page, 28098);
    try {
      await page.goto("/mail");
      await page
        .getByRole("list", { name: "Posteingang" })
        .getByText("Angebot Wartungsvertrag 2027")
        .click();
      await mailShown(page);
      // Petra Keller calls: the card shows her contact, company, last mail and next appointment.
      const call = await box.ring("07223 81234");
      await expect(page.getByRole("dialog", { name: "Anruf von Petra Keller" })).toContainText(
        "Keller Elektro GmbH",
      );
      await shot(page, "phone-call");
      await box.hangup(call);
    } finally {
      box.stop();
    }
  });
});
