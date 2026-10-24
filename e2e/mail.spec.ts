import { expect, type Page, test } from "@playwright/test";
import {
  addMail,
  address,
  inboxMails,
  inboxSubjects,
  jmapAs,
  login,
  personalAccountId,
  unique,
} from "./helpers";
import { deliverMail } from "./protocols";

test.describe("Anmeldung", () => {
  test("lehnt ein falsches Passwort ab", async ({ page }) => {
    await page.goto("/mail");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("E-Mail-Adresse").fill(address("jonas"));
    await page.getByLabel("Passwort").fill("falsch-falsch-falsch");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("alert")).toHaveText("E-Mail-Adresse oder Passwort stimmt nicht.");
  });

  test("bleibt nach dem Neuladen angemeldet, ohne Passwort im Browser", async ({
    page,
    context,
  }) => {
    await login(page);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Posteingang" })).toBeVisible();
    const cookies = await context.cookies();
    expect(cookies.find((cookie) => cookie.name.includes("session_token"))?.httpOnly).toBe(true);
    const stored = await page.evaluate(() =>
      JSON.stringify({ ...localStorage, ...sessionStorage }),
    );
    expect(stored).not.toContain("kaffee");
  });

  test("meldet an und ab", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("heading", { name: "Posteingang" })).toBeVisible();
    await page
      .getByRole("button", { name: address("jonas") })
      .first()
      .click();
    await page.getByRole("menuitem", { name: "Abmelden" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/mail");
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe("Mail", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("zeigt den Posteingang und öffnet eine Mail", async ({ page }) => {
    const list = page.getByRole("list", { name: "Posteingang" });
    await expect(list.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
    const counter = page.getByText(/\d+ ungelesen/);
    const before = Number(((await counter.textContent()) ?? "").split(" ")[0]);
    await list.getByText("Heizung macht Geräusche").click();
    await expect(
      page.getByRole("heading", { name: "Heizung macht Geräusche – Termin möglich?" }),
    ).toBeVisible();
    await expect(
      page.frameLocator("iframe[title='Inhalt der Mail']").getByText("klopft seit gestern"),
    ).toBeVisible();
    // opening marks it read: the unread counter drops
    await expect(counter).toHaveText(`${before - 1} ungelesen`);
  });

  test("passt die Höhe der Mail an, ohne eigene Scrollbar", async ({ page }) => {
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    const frame = page.locator("iframe[title='Inhalt der Mail']");
    await expect(frame.contentFrame().getByText("Keller Elektro GmbH")).toBeVisible();
    // The last paragraph's margin used to stick out of the body and made the frame scroll.
    await expect
      .poll(() =>
        frame.evaluate((element: HTMLIFrameElement) => {
          const root = element.contentDocument!.documentElement;
          return root.scrollHeight - root.clientHeight;
        }),
      )
      .toBe(0);
  });

  test("zeigt Anhänge", async ({ page }) => {
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    const attachments = page.getByRole("list", { name: "Anhänge" });
    await expect(attachments.getByText("Angebot-Wartung-2027.pdf")).toBeVisible();
    // The first page of the PDF as a thumbnail (pdf.js), not just a tile.
    const preview = attachments.getByRole("button", { name: "Angebot-Wartung-2027.pdf ansehen" });
    await expect(preview.locator("img")).toBeVisible();
    await expect
      .poll(() => preview.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(100);
    const download = page.waitForEvent("download");
    await attachments
      .getByRole("button", { name: "Angebot-Wartung-2027.pdf herunterladen" })
      .click();
    expect((await download).suggestedFilename()).toBe("Angebot-Wartung-2027.pdf");
  });

  test("zeigt ein Bild im Anhang als Vorschau", async ({ page }) => {
    await page.getByRole("link", { name: "info@" }).click();
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Anfrage Wärmepumpe Neubau")
      .click();
    const attachments = page.getByRole("list", { name: "Anhänge" });
    await expect(attachments).toContainText("Grundriss-EG.svg");
    await expect(
      attachments.getByRole("button", { name: "Grundriss-EG.svg ansehen" }).locator("img"),
    ).toBeVisible();
  });

  test("schreibt eine neue Mail mit Formatierung an Anna", async ({ page }) => {
    const subject = unique("Materialliste Baustelle");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    const to = page.getByRole("combobox", { name: "An" });
    await to.fill("anna");
    await page.getByRole("option", { name: /Anna Weber/ }).click();
    await page.getByLabel("Betreff").fill(subject);
    const body = page.getByRole("textbox", { name: "Ihre Nachricht …" });
    await body.click();
    await page.getByRole("button", { name: "Fett" }).click();
    await page.keyboard.type("Wichtig:");
    await page.getByRole("button", { name: "Fett" }).click();
    await page.keyboard.type(" bitte bis Freitag bestellen.");
    await page.getByRole("button", { name: "Aufzählung" }).click();
    await page.keyboard.type("Rohre");
    await page.getByRole("button", { name: "Senden" }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(() => inboxSubjects("anna")).toContain(subject);

    await page.getByRole("link", { name: "Gesendet" }).click();
    await expect(page.getByRole("list", { name: "Gesendet" }).getByText(subject)).toBeVisible();
  });

  test("antwortet mit Zitat und Betreff Re:", async ({ page }) => {
    await page.getByRole("list", { name: "Posteingang" }).getByText("Weihnachtsessen").click();
    await page.getByRole("link", { name: /Antworten an Anna/ }).click();
    await expect(page.getByLabel("Betreff")).toHaveValue("Re: Weihnachtsessen – wer ist dabei?");
    await expect(page.getByRole("textbox", { name: "Ihre Nachricht …" })).toContainText(
      "schrieb Anna Weber:",
    );
    await page.keyboard.type("Ich bin dabei.");
    await page.getByRole("button", { name: "Senden" }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect
      .poll(() => inboxSubjects("anna"))
      .toContain("Re: Weihnachtsessen – wer ist dabei?");
  });

  test("legt einen Ordner an und verschiebt eine Mail hinein", async ({ page }) => {
    const folder = unique("Projekt");
    await page.getByRole("button", { name: "Ordner anlegen" }).click();
    await page.getByLabel("Name des Ordners").fill(folder);
    await page.getByRole("dialog").getByRole("button", { name: "Ordner anlegen" }).click();
    await expect(page.getByRole("link", { name: folder })).toBeVisible();

    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Ihre Abschlagsrechnung Oktober")
      .click();
    await page.getByRole("button", { name: "Verschieben nach …" }).click();
    await page.getByRole("menuitem", { name: folder }).click();
    await expect(
      page.getByRole("list", { name: "Posteingang" }).getByText("Ihre Abschlagsrechnung Oktober"),
    ).toHaveCount(0);
    await page.getByRole("link", { name: folder }).click();
    await expect(
      page.getByRole("list", { name: folder }).getByText("Ihre Abschlagsrechnung Oktober"),
    ).toBeVisible();
  });

  test("markiert eine Mail als Spam und holt sie wieder heraus", async ({ page }) => {
    const subject = unique("Gewinnspiel");
    await addMail("jonas", "jonas", subject);
    /** The mail's keywords on the server, to see what the spam filter learns from. */
    const keywords = async () => {
      const client = jmapAs("jonas");
      const accountId = await personalAccountId("jonas");
      const [, get] = await client.request([
        ["Email/query", { accountId, filter: { subject } }, "q"],
        [
          "Email/get",
          {
            accountId,
            "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
            properties: ["keywords"],
          },
          "g",
        ],
      ]);
      return Object.keys((get![1].list as { keywords: object }[])[0]?.keywords ?? {});
    };
    const inbox = page.getByRole("list", { name: "Posteingang" });
    await inbox.getByText(subject).click();
    await page.getByRole("button", { name: "Als Spam markieren" }).click();
    await expect(page.getByRole("status")).toContainText("Als Spam markiert.");
    await expect(inbox.getByText(subject)).toHaveCount(0);
    await expect.poll(keywords).toContain("$junk");

    await page.getByRole("link", { name: "Spam" }).click();
    await page.getByRole("list", { name: "Spam" }).getByText(subject).click();
    await page.getByRole("button", { name: "Kein Spam" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "In den Posteingang verschoben." }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Posteingang" }).first().click();
    await expect(inbox.getByText(subject)).toBeVisible();
    await expect.poll(keywords).toContain("$notjunk");
    expect(await keywords()).not.toContain("$junk");
  });

  test("archiviert und löscht", async ({ page }) => {
    const inbox = page.getByRole("list", { name: "Posteingang" });
    await inbox.getByText("Ihre Bestellung 48211: Umwälzpumpe versandt").click();
    await page.getByRole("button", { name: "Archivieren" }).click();
    await expect(inbox.getByText("Ihre Bestellung 48211: Umwälzpumpe versandt")).toHaveCount(0);
    await page.getByRole("link", { name: "Archiv" }).click();
    await page
      .getByRole("list", { name: "Archiv" })
      .getByText("Ihre Bestellung 48211: Umwälzpumpe versandt")
      .click();
    await page.getByRole("button", { name: "Löschen" }).click();
    await page.getByRole("link", { name: "Papierkorb" }).click();
    await expect(
      page
        .getByRole("list", { name: "Papierkorb" })
        .getByText("Ihre Bestellung 48211: Umwälzpumpe versandt"),
    ).toBeVisible();
  });

  test("arbeitet im gemeinsamen Postfach info@ und antwortet als info@", async ({ page }) => {
    await page.getByRole("link", { name: "info@" }).click();
    const list = page.getByRole("list", { name: "Posteingang" });
    await list.getByText("Anfrage Wärmepumpe Neubau").click();
    await page.getByRole("link", { name: /Antworten an Thomas/ }).click();
    await expect(page.getByLabel("Von")).toHaveValue(/.+/);
    await expect(page.getByLabel("Von").locator("option:checked")).toHaveText(
      /info@weber-haustechnik\.test/,
    );
  });
});

test.describe("Gemeinsames Postfach erkennen und verschieben", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("sagt in der Mail und in der Seitenleiste, dass sie in info@ liegt", async ({ page }) => {
    await page.getByRole("link", { name: "info@" }).click();
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Anfrage Wärmepumpe Neubau")
      .click();
    await expect(
      page.getByText("Gemeinsames Postfach info@weber-haustechnik.test", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Eigene Ordner" })).toContainText(
      "Ordner von info@",
    );
    // The own mailbox has no such note.
    await page.getByRole("link", { name: /^jonas@/ }).click();
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await expect(page.getByRole("heading", { name: "Angebot Wartungsvertrag 2027" })).toBeVisible();
    await expect(page.getByText(/^Gemeinsames Postfach/)).toHaveCount(0);
  });

  test("verschiebt eine Mail aus info@ in einen eigenen Ordner", async ({ page }) => {
    const subject = unique("Rechnung Heizöl");
    await addMail("jonas", "info", subject);
    await page.getByRole("link", { name: "info@" }).click();
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await page.getByRole("button", { name: "Verschieben nach …" }).click();
    // Grouped by mailbox: info@'s folders first, then the own ones.
    const menu = page.getByRole("menu");
    await expect(menu).toContainText("info@weber-haustechnik.test");
    await expect(menu).toContainText("Mein Postfach");
    await menu.getByRole("menuitem", { name: "Steuerberater" }).click();
    await expect(page.getByRole("list", { name: "Posteingang" }).getByText(subject)).toHaveCount(0);

    await page.getByRole("link", { name: /^jonas@/ }).click();
    await page.getByRole("link", { name: "Steuerberater" }).click();
    await page.getByRole("list", { name: "Steuerberater" }).getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  });

  test("zieht eine Mail aus Alle Posteingänge auf einen Ordner", async ({ page }) => {
    const subject = unique("Lieferschein Rohre");
    await addMail("jonas", "info", subject);
    await page.getByRole("link", { name: /Alle Posteingänge/ }).click();
    const row = page.getByRole("list", { name: "Alle Posteingänge" }).getByRole("link", {
      name: new RegExp(subject),
    });
    await expect(row).toContainText("info@");
    await row.dragTo(page.getByRole("link", { name: "Lieferanten" }));
    await expect(page.getByRole("status")).toHaveText("Nach „Lieferanten“ verschoben.");
    await expect(row).toHaveCount(0);

    await page.getByRole("link", { name: "Lieferanten" }).click();
    await expect(page.getByRole("list", { name: "Lieferanten" }).getByText(subject)).toBeVisible();
  });
});

test.describe("Prüfung des Absenders", () => {
  test.beforeEach(async ({ page }) => login(page));

  const open = async (page: Page, subject: string) => {
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  };

  test("warnt vor einer Mail von außen, die sich als die eigene Firma ausgibt", async ({
    page,
  }) => {
    const subject = unique("Dringend: Überweisung heute noch");
    await deliverMail({
      from: address("jonas"),
      fromName: "Jonas Weber",
      to: address("jonas"),
      subject,
      body: "Bitte heute noch 9.800 Euro an den neuen Lieferanten überweisen.",
    });
    await open(page, subject);
    await expect(page.getByRole("alert")).toContainText(
      "gibt sich als Absender aus weber-haustechnik.test aus, kam aber von außen",
    );
    await page.getByRole("button", { name: "Details anzeigen" }).click();
    const details = page.getByRole("region", { name: "Details der Mail" });
    await expect(details).toContainText("Ohne Nachweis");
    await expect(details.getByRole("listitem").filter({ hasText: "DMARC" })).toContainText(
      "nicht eingerichtet",
    );
  });

  test("warnt, wenn Antworten an eine andere Adresse gehen @phone", async ({ page }) => {
    const subject = unique("Neue Bankverbindung");
    await deliverMail({
      from: "petra@keller-elektro.test",
      fromName: "Petra Keller",
      to: address("jonas"),
      replyTo: "petra@konto-wechsel.example",
      subject,
      body: "Bitte überweisen Sie künftig auf unser neues Konto.",
    });
    await open(page, subject);
    await expect(page.getByRole("alert")).toContainText(
      "Antworten gehen an petra@konto-wechsel.example, nicht an den Absender petra@keller-elektro.test",
    );
    await page.getByRole("button", { name: "Details anzeigen" }).click();
    await expect(page.getByRole("region", { name: "Details der Mail" })).toContainText(
      "Antwort an",
    );
    await page.getByRole("button", { name: "Details ausblenden" }).click();
    await expect(page.getByRole("region", { name: "Details der Mail" })).toHaveCount(0);
  });

  test("zeigt bei einer internen Mail Details, aber keine Warnung", async ({ page }) => {
    await open(page, "Weihnachtsessen – wer ist dabei?");
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Details anzeigen" }).click();
    const details = page.getByRole("region", { name: "Details der Mail" });
    await expect(details).toContainText("Anna Weber <anna@weber-haustechnik.test>");
    await expect(details).toContainText("Nicht geprüft");
  });
});

test("sendet aus dem gemeinsamen Postfach als info@", async ({ page }) => {
  const subject = unique("Rückruf Kundin");
  await login(page);
  await page.getByRole("link", { name: "info@" }).click();
  await page.getByRole("link", { name: "Neue Mail" }).first().click();
  await expect(page.getByLabel("Von").locator("option:checked")).toHaveText(/info@/);
  await page.getByRole("combobox", { name: "An" }).fill("anna@weber-haustechnik.test");
  await page.keyboard.press("Enter");
  await page.getByLabel("Betreff").fill(subject);
  await page.getByRole("textbox", { name: "Ihre Nachricht …" }).click();
  await page.keyboard.type("Bitte Frau Sommer zurückrufen.");
  await page.getByRole("button", { name: "Senden" }).click();
  await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
  await expect
    .poll(async () => (await inboxMails("anna")).find((mail) => mail.subject === subject)?.from)
    .toBe(address("info"));
  // The sender name says who wrote it, for the customer and in the shared Sent folder.
  const mail = (await inboxMails("anna")).find((m) => m.subject === subject);
  expect(mail?.fromName).toMatch(/^Jonas Weber \(.+\)$/);
});

test.describe("Postfach nur zum Lesen", () => {
  /** Jonas (a member of info@) shares its inbox with Max for reading only. */
  const share = async (rights: Record<string, boolean> | null) => {
    const client = jmapAs("jonas");
    const session = await client.getSession();
    const info = Object.entries(session.accounts).find(([, a]) => a.name === address("info"))![0];
    const max = await personalAccountId("max");
    const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
      "Mailbox/get",
      { accountId: info, properties: ["role"] },
    );
    const inbox = list.find((mailbox) => mailbox.role === "inbox")!.id;
    await client.call("Mailbox/set", {
      accountId: info,
      update: { [inbox]: { shareWith: rights ? { [max]: rights } : {} } },
    });
  };

  test.afterEach(() => share(null));

  test("zeigt info@ ohne Löschen und antwortet vom eigenen Konto", async ({ page }) => {
    await share({ mayReadItems: true, maySetSeen: true });
    await login(page, "max");
    await page.getByRole("link", { name: "info@" }).click();
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Anfrage Wärmepumpe Neubau")
      .click();
    await expect(page.getByRole("heading", { name: "Anfrage Wärmepumpe Neubau" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Archivieren" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Löschen" })).toHaveCount(0);
    await page.getByRole("link", { name: "Antworten" }).first().click();
    await expect(page.getByLabel("Von").locator("option:checked")).toHaveText(/max@/);
  });
});

test.describe("Mail am Handy @phone", () => {
  test("Liste, Mail, zurück und Ordner", async ({ page }) => {
    await login(page);
    await expect(
      page.getByRole("navigation", { name: "Apps" }).getByRole("link", { name: "Mail" }),
    ).toBeVisible();
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    await expect(page.getByRole("heading", { name: "Angebot Wartungsvertrag 2027" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Posteingang" })).toBeHidden();
    await page.getByRole("button", { name: "Zurück" }).click();
    await expect(page.getByRole("list", { name: "Posteingang" })).toBeVisible();
    await page.getByRole("link", { name: address("jonas") }).click();
    await expect(page.getByRole("link", { name: "Papierkorb" })).toBeVisible();
  });
});

test.describe("Entwürfe", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("speichert automatisch, öffnet den Entwurf wieder und sendet ihn", async ({ page }) => {
    const subject = unique("Angebot Bad");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("anna@weber-haustechnik.test");
    await page.keyboard.press("Enter");
    await page.getByLabel("Betreff").fill(subject);
    await page.getByRole("textbox", { name: "Ihre Nachricht …" }).click();
    await page.keyboard.type("Erster Teil.");
    await expect(page.getByText(/Entwurf gespeichert um/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Schließen" }).click();

    await page.getByRole("link", { name: /Entwürfe/ }).click();
    await page.getByRole("list", { name: "Entwürfe" }).getByText(subject).click();
    await expect(page.getByLabel("Betreff")).toHaveValue(subject);
    const body = page.getByRole("textbox", { name: "Ihre Nachricht …" });
    await expect(body).toContainText("Erster Teil.");
    await body.click();
    await page.keyboard.press("End");
    await page.keyboard.type(" Zweiter Teil.");
    await page.getByRole("button", { name: "Senden" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();
    await expect.poll(() => inboxSubjects("anna")).toContain(subject);
    await expect(page.getByRole("list", { name: "Entwürfe" }).getByText(subject)).toHaveCount(0);
  });

  test("verwirft einen Entwurf ganz", async ({ page }) => {
    const subject = unique("Notiz");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByLabel("Betreff").fill(subject);
    await expect(page.getByText(/Entwurf gespeichert um/)).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Verwerfen" }).click();
    await page.getByRole("link", { name: /Entwürfe/ }).click();
    await expect(page.getByRole("list", { name: "Entwürfe" }).getByText(subject)).toHaveCount(0);
  });
});

test.describe("Sicherheit", () => {
  test("eine Mail mit XSS-Tricks führt nichts aus", async ({ page }) => {
    const dialogs: string[] = [];
    page.on("dialog", (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await login(page);
    await page.getByText("Offene Rechnung – bitte prüfen (XSS-Test)").click();
    const body = page.frameLocator('iframe[title="Inhalt der Mail"]');
    await expect(body.getByText("Betrag: 1.234,56 €")).toBeVisible();
    await expect(body.getByText("Rechnung öffnen")).toBeVisible();
    await expect(body.locator('[href^="javascript:" i], [src^="javascript:" i]')).toHaveCount(0);
    await expect(
      body.locator("script, iframe, object, embed, base[href], meta[http-equiv]"),
    ).toHaveCount(0);
    await expect(body.locator("[onload], [onerror], [onclick]")).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as { __xss?: string }).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);
  });

  test("blockiert Bilder aus dem Internet, bis man sie lädt", async ({ page }) => {
    await login(page);
    await page.getByText("Newsletter: Herbstaktion Wärmepumpen").click();
    const body = page.frameLocator('iframe[title="Inhalt der Mail"]');
    await expect(body.getByRole("heading", { name: "Herbstaktion Wärmepumpen" })).toBeVisible();
    await expect(body.locator('img[src^="https:"]')).toHaveCount(0);
    await page.getByRole("button", { name: /Bilder aus dem Internet sind blockiert/ }).click();
    await expect(body.locator('img[src^="https:"]')).not.toHaveCount(0);
  });
});

test.describe("Alle Posteingänge", () => {
  test("zeigt eigene und gemeinsame Mails in einer Liste und antwortet als info@", async ({
    page,
  }) => {
    await login(page);
    await page.getByRole("link", { name: /Alle Posteingänge/ }).click();
    const list = page.getByRole("list", { name: "Alle Posteingänge" });
    // Own mail and info@ mail side by side, the shared one marked.
    await expect(list.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
    const shared = list.getByRole("link", { name: /Anfrage Wärmepumpe Neubau/ });
    await expect(shared).toContainText("info@");
    await shared.click();
    await expect(page.getByRole("heading", { name: "Anfrage Wärmepumpe Neubau" })).toBeVisible();
    await page.getByRole("link", { name: "Antworten" }).first().click();
    await expect(page.getByLabel("Von").locator("option:checked")).toContainText("info@");
  });
});

test.describe("Alle Posteingänge am Handy @phone", () => {
  test("über die Ordnerliste", async ({ page }) => {
    await login(page);
    await page
      .getByRole("link", { name: /jonas@/ })
      .first()
      .click();
    await page.getByRole("link", { name: /Alle Posteingänge/ }).click();
    await expect(
      page.getByRole("list", { name: "Alle Posteingänge" }).getByText("Anfrage Wärmepumpe Neubau"),
    ).toBeVisible();
  });
});

test.describe("Tastaturkürzel", () => {
  test("j, k, c, ? und Esc in der Mail", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("list", { name: "Posteingang" })).toBeVisible();
    await page.keyboard.press("j");
    await expect(page).toHaveURL(/email=/);
    const opened = new URL(page.url()).searchParams.get("email");
    await page.keyboard.press("j");
    await expect.poll(() => new URL(page.url()).searchParams.get("email")).not.toBe(opened);
    await page.keyboard.press("k");
    await expect.poll(() => new URL(page.url()).searchParams.get("email")).toBe(opened);
    await page.keyboard.press("Escape");
    await expect(page).not.toHaveURL(/email=/);
    await page.keyboard.press("?");
    await expect(page.getByRole("dialog", { name: "Tastaturkürzel" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.keyboard.press("c");
    await expect(page.getByRole("form", { name: "Neue Mail" })).toBeVisible();
    // Typing in the composer is not a shortcut.
    await page.getByLabel("Betreff").fill("jkc?");
    await expect(page.getByLabel("Betreff")).toHaveValue("jkc?");
  });

  test("zeigt die Tastaturkürzel auch über den Knopf in der Leiste", async ({ page }) => {
    await login(page);
    await page.getByRole("button", { name: "Tastaturkürzel anzeigen (?)" }).click();
    const dialog = page.getByRole("dialog", { name: "Tastaturkürzel" });
    await expect(dialog).toContainText("Spam / kein Spam");
  });

  test("2 öffnet den Kalender, m den Monat", async ({ page }) => {
    await login(page);
    await expect(page.getByRole("list", { name: "Posteingang" })).toBeVisible();
    await page.keyboard.press("2");
    await expect(page.getByText(/KW \d+/)).toBeVisible();
    await page.keyboard.press("m");
    await expect(page.getByRole("link", { name: "Monat" })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Breiter Bildschirm", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1700, height: 1000 });
    await login(page);
  });

  test("zeigt neben der Mail, mit wem sie ist", async ({ page }) => {
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    const panel = page.getByRole("complementary", { name: "Zu Petra Keller" });
    await expect(panel).toContainText("Keller Elektro GmbH");
    await expect(panel.getByRole("link", { name: "Kontakt öffnen" })).toBeVisible();
    await panel.getByRole("link", { name: "Mail" }).click();
    await expect(page.getByRole("combobox", { name: "An" })).toBeVisible();
    await expect(page.getByRole("form", { name: "Neue Mail" })).toContainText("Petra Keller");
  });

  test("speichert einen Absender mit einem Klick als Kontakt", async ({ page }) => {
    // A mail of its own: the seed's mails are moved around by other tests.
    const subject = unique("Rückfrage Angebot");
    await addMail("jonas", "jonas", subject);
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    const panel = page.getByRole("complementary", { name: "Zu Erika Test" });
    await panel.getByRole("button", { name: "Als Kontakt speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Erika Test ist jetzt in Ihren Kontakten.");
    await expect(panel.getByRole("link", { name: "Kontakt öffnen" })).toBeVisible();
  });
});

test.describe("Speicherplatz", () => {
  test("zeigt am Avatar und im Menü, wie voll das Postfach ist", async ({ page }) => {
    await login(page);
    // The seed gives every user 5 GB (dev/seed.ts).
    const avatar = page.getByRole("navigation", { name: "Apps" }).getByRole("button", {
      name: address("jonas"),
    });
    await expect(avatar).toHaveAttribute("title", /von 5 GB belegt \(\d+ %\)/);
    await avatar.click();
    await expect(page.getByRole("menu")).toContainText(/von 5 GB belegt/);
  });
});

test.describe("Suche", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await expect(page.getByRole("list", { name: "Posteingang" })).toBeVisible();
  });

  const searchFor = async (page: Page, text: string) => {
    const box = page.getByRole("combobox", { name: "Suchen" });
    await box.fill(text);
    await box.press("Enter");
    return page.getByRole("list", { name: "Suche" });
  };

  test("findet in allen Ordnern und Postfächern, auch die Mehrzahl", async ({ page }) => {
    const results = await searchFor(page, "angebote");
    await expect(page).toHaveURL(/\/mail\/all\/search\?q=angebote/);
    await expect(results.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
    // From the folder Kunden/Hoffmann and from info@, each named.
    await expect(results.getByRole("link", { name: /Badsanierung Obergeschoss/ })).toContainText(
      "Hoffmann",
    );
    await expect(results.getByRole("link", { name: /Anfrage Wärmepumpe Neubau/ })).toContainText(
      "info@",
    );
    await expect(results.locator("mark").first()).toHaveText(/angebot/i);
    await expect(page.getByText(/\d+ Treffer/)).toBeVisible();

    // A hit from info@ opens in its mailbox.
    await results.getByText("Anfrage Wärmepumpe Neubau").click();
    await expect(page.getByRole("heading", { name: "Anfrage Wärmepumpe Neubau" })).toBeVisible();
    await expect(page).toHaveURL(/account=/);
  });

  test("versteht Operatoren und Chips", async ({ page }) => {
    let results = await searchFor(page, "von:keller hat:anhang");
    await expect(results.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
    await expect(results.getByText("Rechnung 2026-117", { exact: true })).toBeVisible();
    await expect(results.getByText("Heizung macht Geräusche – Termin möglich?")).toHaveCount(0);

    results = await searchFor(page, "von:keller in:rechnung@");
    await expect(results.getByText("Rechnung 2026-117", { exact: true })).toBeVisible();
    await expect(results.getByText("Angebot Wartungsvertrag 2027")).toHaveCount(0);

    results = await searchFor(page, "angebot");
    await expect(results.getByText("Re: Badsanierung Obergeschoss")).toBeVisible();
    await page.getByRole("button", { name: "Mit Anhang" }).click();
    await expect(page).toHaveURL(/hat%3Aanhang|hat:anhang/);
    await expect(results.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
    await expect(results.getByText("Re: Badsanierung Obergeschoss")).toHaveCount(0);
  });

  test("schlägt Kontakte vor und sucht mit / ", async ({ page }) => {
    await page.keyboard.press("/");
    const box = page.getByRole("combobox", { name: "Suchen" });
    await expect(box).toBeFocused();
    await page.keyboard.type("von:hoff");
    await page.getByRole("option", { name: /Markus Hoffmann/ }).click();
    await expect(box).toHaveValue(/^von:m\.hoffmann@schreinerei-hoffmann\.test $/);
    await box.press("Enter");
    await expect(
      page.getByRole("list", { name: "Suche" }).getByText("Re: Badsanierung Obergeschoss"),
    ).toBeVisible();
    // The search is remembered and offered again in an empty box.
    await box.fill("");
    await box.focus();
    await expect(page.getByRole("option", { name: /von:m\.hoffmann/ })).toBeVisible();
  });

  test("sagt, wenn nichts gefunden wurde", async ({ page }) => {
    const results = page.getByText(/Nichts gefunden/);
    await searchFor(page, "xylophonunterricht");
    await expect(results).toBeVisible();
  });
});

test.describe("Suche am Handy @phone", () => {
  test("Suchen und Treffer öffnen", async ({ page }) => {
    await login(page);
    const box = page.getByRole("combobox", { name: "Suchen" });
    await box.fill("wärmepumpe");
    await box.press("Enter");
    const results = page.getByRole("list", { name: "Suche" });
    await results.getByText("Anfrage Wärmepumpe Neubau").click();
    await expect(page.getByRole("heading", { name: "Anfrage Wärmepumpe Neubau" })).toBeVisible();
  });
});
