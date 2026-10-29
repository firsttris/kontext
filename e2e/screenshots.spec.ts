import { expect, type Page, test } from "@playwright/test";
import { fillDemo } from "./demo-data";
import {
  addAttendees,
  addMail,
  address,
  addSnippet,
  externalHintOn,
  jmapAs,
  login,
  personalAccountId,
  removeSnippet,
  revokeDeputy,
} from "./helpers";
import { calendarOnTheWeb } from "./ics-server";
import { deliverInvitation } from "./invitation-mail";
import { pairBox } from "./paired-box";
import { giveKey } from "./pgp-key";
import { buildingSitePng } from "./picture";
import { printed, recordPrints } from "./printed";

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

  test("Vertretung", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    try {
      await login(page, "sandra");
      await page.goto("/settings?section=deputy");
      await page.getByLabel("Kollegin oder Kollege").selectOption({ label: "Max Becker" });
      await page.getByLabel("Zugriff", { exact: true }).selectOption({ label: "Bearbeiten" });
      await page.getByRole("button", { name: "Freigeben" }).click();
      await expect(
        page.getByRole("list", { name: "Wer hat Zugriff" }).getByText("Max Becker"),
      ).toBeVisible();
      // The toast would cover the list.
      await expect(page.getByRole("status")).toHaveCount(0, { timeout: 10_000 });
      await shot(page, "deputy");
    } finally {
      await revokeDeputy("sandra", "max");
    }
  });

  test(".eml-Dateien importieren", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const accountId = await personalAccountId("jonas");
    const client = jmapAs("jonas");
    const made = await client.call<{ created: Record<string, { id: string }> }>("Mailbox/set", {
      accountId,
      create: { f: { name: "Altablage 2024", parentId: null } },
    });
    const folderId = made.created.f!.id;
    const mail = (subject: string, date: string) => ({
      name: `${subject}.eml`,
      mimeType: "message/rfc822",
      buffer: Buffer.from(
        [
          "From: Petra Keller <petra@keller-elektro.test>",
          `To: ${address("jonas")}`,
          `Subject: ${subject}`,
          `Date: ${date}`,
          "Content-Type: text/plain; charset=utf-8",
          "",
          "Das Angebot im Anhang, wie besprochen.",
          "",
        ].join("\r\n"),
      ),
    });
    try {
      await login(page);
      await page.goto(`/mail/${accountId}/${folderId}`);
      await page
        .locator('input[type="file"][aria-label="E-Mails importieren (.eml)"]')
        .setInputFiles([
          mail("Angebot Wärmepumpe Haus Krämer", "Tue, 4 Mar 2025 09:15:00 +0100"),
          mail("Nachtrag Elektroarbeiten Bauabschnitt 2", "Fri, 14 Feb 2025 16:40:00 +0100"),
          mail("Abnahmeprotokoll Heizungsanlage", "Mon, 20 Jan 2025 11:05:00 +0100"),
          {
            name: "Rechnung Dezember.msg",
            mimeType: "application/vnd.ms-outlook",
            buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
          },
        ]);
      await expect(page.getByText("3 Mails importiert.")).toBeVisible();
      await expect(
        page.getByRole("list", { name: "Altablage 2024" }).getByText("Abnahmeprotokoll"),
      ).toBeVisible();
      await shot(page, "eml-import");
    } finally {
      await client.call("Mailbox/set", {
        accountId,
        destroy: [folderId],
        onDestroyRemoveEmails: true,
      });
    }
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

  test("Mailliste sortieren", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await mailShown(page);
    await page.getByRole("button", { name: /^Sortierung:/ }).click();
    await page.getByRole("menuitemradio", { name: "Ungelesene zuerst" }).click();
    await page.getByRole("button", { name: "Sortierung: Ungelesene zuerst" }).click();
    await expect(page.getByRole("menuitemradio", { name: "Ungelesene zuerst" })).toBeChecked();
    await shot(page, "mail-sort");
  });

  test("Bild in der Mail", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("m.hoffmann@schreinerei-hoffmann.test");
    await page.keyboard.press("Enter");
    await page.getByLabel("Betreff").fill("Baustelle Rheinstraße – Stand heute");
    const body = page.getByRole("textbox", { name: "Ihre Nachricht …" });
    await body.click();
    await page.keyboard.type("Hallo Herr Hoffmann,");
    await page.keyboard.press("Enter");
    await page.keyboard.type("so sieht der Rohbau heute aus:");
    await page.keyboard.press("Enter");
    await page.locator('input[type="file"][accept^="image/png"]').setInputFiles({
      name: "rohbau.png",
      mimeType: "image/png",
      buffer: buildingSitePng(),
    });
    const image = body.locator('img[alt="rohbau.png"]');
    await expect.poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(480);
    // Selected, so its corners for resizing show.
    await image.click();
    await page.mouse.move(1, 1);
    await shot(page, "compose-image");
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

  test("Als Anhang weiterleiten", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    const original = "Angebot Wartungsvertrag 2027";
    await page.getByRole("list", { name: "Posteingang" }).getByText(original).click();
    await page.getByRole("button", { name: "Weitere Aktionen" }).click();
    await page.getByRole("menuitem", { name: "Als Anhang weiterleiten" }).click();
    await page.getByRole("combobox", { name: "An" }).fill("kanzlei@steuerberatung-mueller.test");
    await page.keyboard.press("Enter");
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Hallo, anbei das Angebot als Mail für die Unterlagen.");
    await expect(page.getByText(`${original}.eml`)).toBeVisible();
    await shot(page, "forward-eml");
  });

  test("Textbaustein mit eigenen Feldern", async ({ page }) => {
    const title = "Auftragsbestätigung";
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await removeSnippet(page, title);
    await addSnippet(
      page,
      title,
      "Guten Tag {Name},\n\nvielen Dank für Ihren Auftrag {Auftragsnummer} vom {Datum}. Unser Monteur kommt am {Termin} zu Ihnen.\n\nViele Grüße\n{Absender}",
    );
    try {
      await page.goto("/mail");
      await page.getByRole("link", { name: "Neue Mail" }).first().click();
      await page.getByRole("combobox", { name: "An" }).fill("petra");
      await page.getByRole("option", { name: /Petra Keller/ }).click();
      await page.getByLabel("Betreff").fill("Ihr Auftrag bei Weber Haustechnik");
      await page.getByRole("button", { name: "Textbaustein einfügen" }).click();
      await page.getByRole("menuitem", { name: title }).click();
      const dialog = page.getByRole("dialog", { name: "Textbaustein ausfüllen" });
      await dialog.getByLabel("Auftragsnummer").fill("A-2027-0815");
      await dialog.getByLabel("Termin").fill("Dienstag, 8 Uhr");
      await shot(page, "snippet-fields");
    } finally {
      await removeSnippet(page, title);
    }
  });

  test("Pflichtangaben unter der Mail", async ({ page }) => {
    // Answered for this page only: set at the server, other tests' mails would carry them.
    await page.route("**/api/company/legal-footer", (route) =>
      route.request().method() === "GET"
        ? route.fulfill({
            json: {
              text: "Weber Haustechnik GmbH · Sitz: Bühl (Baden) · Amtsgericht Mannheim HRB 712345\nGeschäftsführer: Jonas Weber · USt-IdNr. DE 287 654 321",
            },
          })
        : route.fallback(),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("petra");
    await page.getByRole("option", { name: /Petra Keller/ }).click();
    await page.getByLabel("Betreff").fill("Termin Heizungswartung");
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill(
        "Hallo Frau Keller,\nwir kommen am Dienstag gegen 9 Uhr zur Wartung Ihrer Heizung.\nViele Grüße\nJonas Weber",
      );
    await expect(page.getByRole("region", { name: "Pflichtangaben der Firma" })).toBeVisible();
    await shot(page, "legal-footer");
    // No draft left behind.
    await page.getByRole("button", { name: "Verwerfen" }).click();
  });

  test("Antwort an", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An", exact: true }).fill("petra");
    await page.getByRole("option", { name: /Petra Keller/ }).click();
    await page.getByRole("button", { name: "Antwort an" }).click();
    await page.getByRole("combobox", { name: "Antwort an" }).fill(address("info"));
    await page.keyboard.press("Enter");
    await page.getByLabel("Betreff").fill("Angebot Wartungsvertrag 2027");
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill(
        "Hallo Frau Keller,\nIhre Antwort geht direkt an unser Büro, dort ist immer jemand erreichbar.\nViele Grüße\nJonas Weber",
      );
    await shot(page, "reply-to");
    // No draft left behind.
    await page.getByRole("button", { name: "Verwerfen" }).click();
  });

  // Switched on for this page only (externalHintOn): the setting at the server stays as it is.
  test("Hinweis Extern", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await externalHintOn(page, { partners: ["braun-steuer.test"] });
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await mailShown(page);
    await page.getByRole("link", { name: /Antworten an Petra/ }).click();
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Hallo Frau Keller, Halle 2 nehmen wir mit auf. Viele Grüße, Jonas Weber");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "An externe Empfänger senden?" })).toBeVisible();
    await shot(page, "external-hint");
  });

  test("Erinnerung je Kalender", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    await page
      .getByRole("dialog", { name: "Kalender verwalten" })
      .getByRole("button", { name: "Erinnerung: Mein Kalender" })
      .click();
    const defaults = page.getByRole("dialog", { name: "Erinnerung für „Mein Kalender“" });
    await defaults.getByLabel("Termine mit Uhrzeit").selectOption({ label: "30 Minuten vorher" });
    await defaults.getByLabel("Ganztägige Termine").selectOption({ label: "1 Tag vorher" });
    await defaults.getByLabel("Erinnern per").last().selectOption({ label: "Mail" });
    await page.mouse.move(1, 1);
    await shot(page, "calendar-default-reminder");
  });

  test("winmail.dat ausgepackt", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.getByRole("link", { name: "Lieferanten" }).click();
    await page.getByRole("list", { name: "Lieferanten" }).getByText("Lieferschein 48211").click();
    const attachments = page.getByRole("list", { name: "Anhänge" });
    await expect(
      attachments.getByRole("button", { name: "Lieferschein-48211.pdf ansehen" }).locator("img"),
    ).toBeVisible();
    await shot(page, "winmail");
  });

  test("Formatierung beim Schreiben", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("petra");
    await page.getByRole("option", { name: /Petra Keller/ }).click();
    await page.getByLabel("Betreff").fill("Preise Wartung 2027");
    await page.getByRole("textbox", { name: "Ihre Nachricht …" }).click();
    await page.keyboard.type("Hallo Frau Keller,");
    await page.keyboard.press("Enter");
    await page.keyboard.type("hier die Preise für ");
    await page.getByRole("button", { name: "Textfarbe" }).click();
    await page.getByRole("menuitemradio", { name: "Blau" }).click();
    await page.getByRole("button", { name: "Fett" }).click();
    await page.keyboard.type("2027");
    await page.getByRole("button", { name: "Fett" }).click();
    await page.getByRole("button", { name: "Textfarbe" }).click();
    await page.getByRole("menuitemradio", { name: "Automatisch" }).click();
    await page.keyboard.type(":");
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Tabelle", exact: true }).click();
    await page.getByRole("menuitem", { name: "Tabelle einfügen (3 × 3)" }).click();
    await page.getByRole("button", { name: "Tabelle", exact: true }).click();
    await page.getByRole("menuitem", { name: "Kopfzeile an/aus" }).click();
    for (const cell of ["Leistung", "2026", "2027", "Wartung Heizung", "189 €", "199 €"]) {
      await page.keyboard.type(cell);
      await page.keyboard.press("Tab");
    }
    await page.keyboard.type("Notdienst");
    await page.keyboard.press("Tab");
    await page.keyboard.type("95 €");
    await page.keyboard.press("Tab");
    await page.getByRole("button", { name: "Hintergrundfarbe" }).click();
    await page.getByRole("menuitemradio", { name: "Gelb" }).click();
    await page.keyboard.type("95 €");
    await page.getByRole("button", { name: "Hintergrundfarbe" }).click();
    await page.mouse.move(1, 1);
    await shot(page, "compose-formatting");
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

  test("Termin duplizieren", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto(`/calendar?date=${today()}`);
    await page.locator(`[data-day="${today()}"]`).getByText("Baubesprechung Hoffmann").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Duplizieren" }).click();
    await expect(dialog.getByLabel("Titel")).toHaveValue("Baubesprechung Hoffmann");
    await shot(page, "event-duplicate");
  });

  test("Kalender abonnieren", async ({ page }) => {
    const web = await calendarOnTheWeb();
    web.serve(["Pädagogischer Tag", "Bewegliche Ferientage"]);
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Kalender verwalten" });
    await dialog.getByLabel("Adresse des Kalenders").fill(web.url);
    await dialog.getByLabel("Name", { exact: true }).fill("Schulferien Bühl");
    await dialog.getByRole("button", { name: "Abonnieren" }).click();
    await expect(dialog.getByRole("list", { name: "Kalender abonnieren" })).toBeVisible();
    await dialog.getByLabel("Adresse des Kalenders").fill("webcal://abfall.buehl.de/termine.ics");
    await dialog.getByLabel("Name", { exact: true }).fill("Müllabfuhr");
    await page.mouse.move(1, 1);
    await shot(page, "calendar-subscriptions");
    web.close();
  });

  test("Termine aus Datei", async ({ page }) => {
    // A supplier's dates as a file, a few weeks ahead; one is already in Jonas' calendar.
    const day = (offset: number) =>
      new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" })
        .format(new Date(Date.now() + offset * 86_400_000))
        .replaceAll("-", "");
    const client = jmapAs("jonas");
    const { list } = await client.call<{ list: { uid: string; title: string }[] }>(
      "CalendarEvent/get",
      { accountId: await personalAccountId("jonas"), properties: ["uid", "title"] },
      ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"],
    );
    const known = list.find((event) => event.title === "Baubesprechung Hoffmann")!;
    const event = (uid: string, title: string, start: string, end: string, extra = "") =>
      `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261001T100000Z\r\nDTSTART;TZID=Europe/Berlin:${start}\r\nDTEND;TZID=Europe/Berlin:${end}\r\nSUMMARY:${title}\r\n${extra}END:VEVENT\r\n`;
    const ics = [
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Richter Großhandel//DE\r\n",
      event(
        "hausmesse@richter",
        "Hausmesse Richter Großhandel",
        `${day(16)}T090000`,
        `${day(16)}T170000`,
      ),
      event(
        "schulung@richter",
        "Schulung Wärmepumpen-Inbetriebnahme",
        `${day(23)}T080000`,
        `${day(23)}T120000`,
      ),
      event(
        "runde@richter",
        "Lieferantenrunde Richter",
        `${day(9)}T100000`,
        `${day(9)}T110000`,
        "RRULE:FREQ=MONTHLY;COUNT=6\r\n",
      ),
      event(
        "abholung@richter",
        "Abholung Heizkörper Lager Bühl",
        `${day(12)}T070000`,
        `${day(12)}T073000`,
      ),
      event(known.uid, known.title, `${day(0)}T100000`, `${day(0)}T110000`),
      "END:VCALENDAR\r\n",
    ].join("");
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    const dialog = page.getByRole("dialog", { name: "Kalender verwalten" });
    await dialog.getByLabel("Datei (.ics)", { exact: true }).setInputFiles({
      name: "richter-termine.ics",
      mimeType: "text/calendar",
      buffer: Buffer.from(ics),
    });
    await expect(dialog.getByText("4 neu, 1 schon vorhanden")).toBeVisible();
    await dialog.getByRole("button", { name: "Übernehmen" }).scrollIntoViewIfNeeded();
    await shot(page, "calendar-ics-import");
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

  test("Kalender gedruckt", async ({ page, browser }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto(`/calendar?view=week&date=${today()}`);
    await expect(
      page.locator(`[data-day="${today()}"]`).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
    await recordPrints(page);
    await page.getByRole("button", { name: "Drucken" }).click();
    await expect.poll(async () => (await printed(page)).length).toBe(1);
    // The sheet as on landscape A4 at 96 dpi; the page's margin (@page) drawn as padding.
    const sheet = await (
      await browser.newContext({ viewport: { width: 1123, height: 794 } })
    ).newPage();
    await sheet.setContent((await printed(page))[0]!);
    await sheet.emulateMedia({ media: "print" });
    await sheet.addStyleTag({ content: "body { padding: 10mm; }" });
    await sheet.screenshot({ path: "docs/screenshots/calendar-print.png" });
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

    await page.goto(`/calendar?date=${today()}&event=new&start=${today()}T14:00`);
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

  test("Mehrere Kontakte", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await login(page);
    await page.goto("/contacts");
    await page.getByRole("link", { name: /Petra Keller/ }).click();
    await expect(page.getByRole("heading", { name: "Petra Keller" })).toBeVisible();
    // Only picked, nothing changed: the seed's contacts stay for the other pictures.
    for (const name of ["Sabine Braun", "Markus Hoffmann", "Petra Keller"])
      await page.getByRole("checkbox", { name: `${name} auswählen` }).click();
    await expect(page.getByText("3 ausgewählt")).toBeVisible();
    await page.getByRole("list", { name: "Gruppen" }).scrollIntoViewIfNeeded();
    await shot(page, "contacts-bulk");
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
