import { expect, test } from "@playwright/test";
import { address, inboxMails, inboxSubjects, login, unique } from "./helpers";

test.describe("Anmeldung", () => {
  test("lehnt ein falsches Passwort ab", async ({ page }) => {
    await page.goto("/mail");
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("E-Mail-Adresse").fill(address("jonas"));
    await page.getByLabel("Passwort").fill("falsch-falsch-falsch");
    await page.getByRole("button", { name: "Anmelden" }).click();
    await expect(page.getByRole("alert")).toHaveText("E-Mail-Adresse oder Passwort stimmt nicht.");
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
  });
});

test.describe("Mail", () => {
  test.beforeEach(async ({ page }) => login(page));

  test("zeigt den Posteingang und öffnet eine Mail", async ({ page }) => {
    const list = page.getByRole("list", { name: "Posteingang" });
    await expect(list.getByText("Angebot Wartungsvertrag 2027")).toBeVisible();
    const counter = page.getByText(/\d+ ungelesen/);
    const before = Number((await counter.innerText()).split(" ")[0]);
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

  test("zeigt Anhänge", async ({ page }) => {
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Angebot Wartungsvertrag 2027")
      .click();
    const attachments = page.getByRole("list", { name: "Anhänge" });
    await expect(attachments.getByText("Angebot-Wartung-2027.pdf")).toBeVisible();
    const download = page.waitForEvent("download");
    await attachments.getByRole("button", { name: "Öffnen" }).click();
    expect((await download).suggestedFilename()).toBe("Angebot-Wartung-2027.pdf");
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

  test("sucht im Postfach", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Suchen" }).fill("Fahrzeugkosten");
    const list = page.getByRole("list", { name: "Posteingang" });
    await expect(list.getByText("Rückfrage Fahrzeugkosten Q3")).toBeVisible();
    await expect(list.getByText("Angebot Wartungsvertrag 2027")).toHaveCount(0);
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
