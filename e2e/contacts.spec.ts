import { readFile } from "node:fs/promises";
import { expect, type Page, test } from "@playwright/test";
import { createContact, listAddressBooks } from "../src/jmap/contacts";
import { addMail, jmapAs, login, personalAccountId, unique } from "./helpers";

test.describe("Kontakte", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kontakte" }).first().click();
  });

  test("zeigt einen Kontakt mit Mails und Termin und schreibt ihm", async ({ page }) => {
    await page.getByRole("link", { name: /Markus Hoffmann/ }).click();
    await expect(page.getByRole("heading", { name: "Markus Hoffmann" })).toBeVisible();
    await expect(page.getByText("Re: Badsanierung Obergeschoss")).toBeVisible();
    await expect(page.getByRole("link", { name: /Baubesprechung Hoffmann/ })).toBeVisible();
    await page.getByRole("link", { name: "Mail schreiben" }).click();
    await expect(
      page.getByRole("form", { name: "Neue Mail" }).getByText("Markus Hoffmann"),
    ).toBeVisible();
  });

  test("sucht", async ({ page }) => {
    await page.getByRole("searchbox", { name: "Kontakte suchen" }).fill("elektro");
    await expect(page.getByRole("link", { name: /Petra Keller/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Markus Hoffmann/ })).toHaveCount(0);
  });

  test("legt an, ändert und löscht", async ({ page }) => {
    const surname = unique("Fischer");
    await page.getByRole("link", { name: "Neuer Kontakt" }).click();
    await page.getByLabel("Vorname").fill("Eva");
    await page.getByLabel("Nachname").fill(surname);
    await page.getByLabel("Firma").fill("Fischer Bau");
    await page.getByLabel("E-Mail").fill("eva@fischer-bau.test");
    await page.getByLabel("Telefon").fill("+49 7223 4711");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("heading", { name: `Eva ${surname}` })).toBeVisible();
    await expect(page.getByText("eva@fischer-bau.test")).toBeVisible();

    await page.getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByLabel("Telefon").fill("+49 7223 4712");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByText("+49 7223 4712")).toBeVisible();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByRole("button", { name: "Kontakt löschen" }).click();
    await expect(page.getByRole("link", { name: new RegExp(surname) })).toHaveCount(0);
  });

  test("verlangt einen Namen", async ({ page }) => {
    await page.getByRole("link", { name: "Neuer Kontakt" }).click();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("alert")).toHaveText("Bitte einen Namen angeben.");
  });

  test("schlägt Kontakte beim Schreiben vor", async ({ page }) => {
    await page.getByRole("link", { name: "Mail" }).first().click();
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("kel");
    await expect(page.getByRole("option", { name: /Petra Keller/ })).toBeVisible();
  });
});

test.describe("Kontaktgruppen", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto("/contacts");
  });

  test("legt eine Gruppe an, schreibt allen und ändert sie", async ({ page }) => {
    const name = unique("Kunden Bühl");
    await page.getByRole("link", { name: "Neue Gruppe" }).click();
    await page.getByLabel("Name der Gruppe").fill(name);
    await page.getByLabel("Mitglieder suchen").fill("hoff");
    await page.getByRole("checkbox", { name: /Markus Hoffmann/ }).check();
    await page.getByLabel("Mitglieder suchen").fill("sommer");
    await page.getByRole("checkbox", { name: /Claudia Sommer/ }).check();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
    const members = page.getByRole("list", { name: "Mitglieder" });
    await expect(members.getByRole("link")).toHaveCount(2);

    // The contact shows its group.
    await members.getByRole("link", { name: /Claudia Sommer/ }).click();
    const chip = page.getByRole("link", { name, exact: true });
    await expect(chip).toBeVisible();
    await chip.click();

    // One mail to all members.
    await page.getByRole("link", { name: "Mail an alle" }).click();
    const compose = page.getByRole("form", { name: "Neue Mail" });
    await expect(compose.getByText("Markus Hoffmann")).toBeVisible();
    await expect(compose.getByText("Claudia Sommer")).toBeVisible();

    // Markus leaves the group, then it is deleted.
    await page.goto("/contacts");
    await page
      .getByRole("list", { name: "Gruppen" })
      .getByRole("link", { name: new RegExp(name) })
      .click();
    await page.getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByRole("checkbox", { name: /Markus Hoffmann/ }).uncheck();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("list", { name: "Mitglieder" }).getByRole("link")).toHaveCount(1);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("link", { name: "Bearbeiten" }).click();
    await page.getByRole("button", { name: "Gruppe löschen" }).click();
    await expect(page.getByRole("link", { name: new RegExp(name) })).toHaveCount(0);
  });

  test("schlägt eine Gruppe beim Schreiben vor", async ({ page }) => {
    await page.getByRole("link", { name: "Mail" }).first().click();
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("liefer");
    await page.getByRole("option", { name: /Lieferanten.*Gruppe · 2 Kontakte/ }).click();
    const compose = page.getByRole("form", { name: "Neue Mail" });
    await expect(compose.getByText("Petra Keller")).toBeVisible();
    await expect(compose.getByText("Bestellannahme Richter")).toBeVisible();
  });
});

test.describe("vCard", () => {
  test("importiert eine Datei ohne Doppelte und exportiert das Adressbuch", async ({ page }) => {
    const book = unique("Import");
    const surname = unique("Mustermann");
    const file = {
      name: "kontakte.vcf",
      mimeType: "text/vcard",
      buffer: Buffer.from(
        [
          "BEGIN:VCARD",
          "VERSION:3.0",
          `FN:Erika ${surname}`,
          `N:${surname};Erika;;;`,
          "ORG:Muster GmbH",
          "EMAIL;TYPE=WORK:erika@muster.test",
          "TEL;TYPE=CELL:+49 170 1112233",
          "END:VCARD",
          "BEGIN:VCARD",
          "VERSION:4.0",
          `FN:Hans ${surname}`,
          "EMAIL:hans@muster.test",
          "END:VCARD",
          "",
        ].join("\r\n"),
      ),
    };
    await login(page);
    await page.goto("/contacts");
    await page.getByRole("button", { name: "Adressbücher" }).click();
    const dialog = page.getByRole("dialog", { name: "Adressbücher" });
    await dialog.getByLabel("Name des Adressbuchs").fill(book);
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    await dialog.getByLabel("Adressbuch für Import und Export").selectOption({ label: book });

    await dialog.getByLabel("vCard-Datei").setInputFiles(file);
    await expect(dialog.getByText("2 neue Kontakte gefunden.")).toBeVisible();
    await dialog.getByRole("button", { name: "2 importieren" }).click();
    await expect(page.getByRole("status")).toHaveText("2 Kontakte importiert.");

    // The same file again adds nothing.
    await dialog.getByLabel("vCard-Datei").setInputFiles(file);
    await expect(
      dialog.getByText("0 neue Kontakte gefunden. 2 sind schon vorhanden."),
    ).toBeVisible();
    await dialog.getByRole("button", { name: "Abbrechen" }).click();

    // Export: both cards in one file.
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      dialog.getByRole("button", { name: "Exportieren" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe(`${book}.vcf`);
    const content = await readFile(await download.path(), "utf8");
    expect(content).toContain(`FN:Erika ${surname}`);
    expect(content).toContain("EMAIL;TYPE=work:erika@muster.test");
    expect(content).toContain(`FN:Hans ${surname}`);
    await page.keyboard.press("Escape");

    await expect(page.getByRole("link", { name: new RegExp(`Erika ${surname}`) })).toBeVisible();
    await page.getByRole("link", { name: new RegExp(`Erika ${surname}`) }).click();
    await expect(page.getByText("+49 170 1112233")).toBeVisible();

    // One contact as a file.
    const [single] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "vCard" }).click(),
    ]);
    expect(single.suggestedFilename()).toBe(`Erika ${surname}.vcf`);

    page.once("dialog", (confirm) => confirm.accept());
    await page.getByRole("button", { name: "Adressbücher" }).click();
    await dialog.getByRole("button", { name: `Adressbuch löschen: ${book}` }).click();
    await expect(dialog.getByText(book)).toHaveCount(0);
  });
});

test.describe("Adressbücher teilen", () => {
  test("Jonas teilt ein Adressbuch mit Anna, erst zum Bearbeiten, dann nur zum Lesen", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const book = unique("Kunden");
    const surname = unique("Wagner");
    await login(page);
    await page.goto("/contacts");

    // A new address book, shared with Anna to edit.
    await page.getByRole("button", { name: "Adressbücher" }).click();
    const books = page.getByRole("dialog", { name: "Adressbücher" });
    await books.getByLabel("Name des Adressbuchs").fill(book);
    await books.getByRole("button", { name: "Anlegen" }).click();
    await books.getByRole("button", { name: `Teilen: ${book}` }).click();
    const share = page.getByRole("dialog", { name: `„${book}“ teilen` });
    await share.getByLabel("Anna Weber").selectOption("edit");
    await share.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Freigabe gespeichert.");
    await expect(books.getByText("Geteilt mit Anna Weber")).toBeVisible();
    await page.keyboard.press("Escape");

    // A contact in it.
    await page.getByLabel("Adressbuch", { exact: true }).selectOption({ label: book });
    await page.getByRole("link", { name: "Neuer Kontakt" }).click();
    await expect(page.getByLabel("Adressbuch", { exact: true }).last()).toHaveValue(/:/);
    await page.getByLabel("Vorname").fill("Jan");
    await page.getByLabel("Nachname").fill(surname);
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("heading", { name: `Jan ${surname}` })).toBeVisible();

    // Anna finds it under "Geteilt mit mir" and changes it.
    const anna = await (
      await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" })
    ).newPage();
    await login(anna, "anna");
    // Jonas' account is no shared mailbox for her.
    const mailboxes = anna.getByRole("navigation", { name: "Postfächer" });
    await expect(mailboxes).toContainText("info@");
    await expect(mailboxes).not.toContainText("jonas@");
    await anna.goto("/contacts");
    await anna.getByRole("button", { name: "Adressbücher" }).click();
    await expect(
      anna
        .getByRole("dialog", { name: "Adressbücher" })
        .getByRole("listitem")
        .filter({ hasText: book }),
    ).toContainText("Jonas Weber · Darf bearbeiten");
    await anna.keyboard.press("Escape");
    await anna
      .getByLabel("Adressbuch", { exact: true })
      .selectOption({ label: `${book} · Jonas Weber` });
    await anna.getByRole("link", { name: new RegExp(surname) }).click();
    await expect(anna.getByText("Von Jonas Weber geteilt.")).toBeVisible();
    await anna.getByRole("link", { name: "Bearbeiten" }).click();
    await anna.getByLabel("Telefon").fill("+49 7223 9988");
    await anna.getByRole("button", { name: "Speichern" }).click();
    await expect(anna.getByText("+49 7223 9988")).toBeVisible();

    // Jonas sees her change and makes it read-only.
    await page.reload();
    await expect(page.getByText("+49 7223 9988")).toBeVisible();
    await page.getByRole("button", { name: "Adressbücher" }).click();
    await books.getByRole("button", { name: `Teilen: ${book}` }).click();
    await share.getByLabel("Anna Weber").selectOption("read");
    await share.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Freigabe gespeichert.");

    await anna.reload();
    await expect(anna.getByText("Von Jonas Weber geteilt, nur zum Lesen.")).toBeVisible();
    await expect(anna.getByRole("link", { name: "Bearbeiten" })).toHaveCount(0);

    // Deleting the book removes it for both.
    page.once("dialog", (dialog) => dialog.accept());
    await books.getByRole("button", { name: `Adressbuch löschen: ${book}` }).click();
    await expect(books.getByText(book)).toHaveCount(0);
    await anna.goto("/contacts");
    await expect(anna.getByRole("link", { name: new RegExp(surname) })).toHaveCount(0);
  });
});

test.describe("Kontakte am Handy @phone", () => {
  /** Contacts are under "Mehr" in the tab bar. */
  const openContacts = async (page: Page) => {
    await page.getByRole("button", { name: "Mehr" }).click();
    await page.getByRole("menuitem", { name: "Kontakte" }).click();
  };

  test("Liste und Kontakt", async ({ page }) => {
    await login(page);
    await openContacts(page);
    await expect(page.getByRole("searchbox", { name: "Kontakte suchen" })).toBeVisible();
    await page.getByRole("link", { name: /Petra Keller/ }).click();
    await expect(page.getByRole("heading", { name: "Petra Keller" })).toBeVisible();
    await page.getByRole("link", { name: "Kontakte", exact: true }).first().click();
    await expect(page.getByRole("searchbox", { name: "Kontakte suchen" })).toBeVisible();
  });

  test("Adressbücher", async ({ page }) => {
    await login(page);
    await openContacts(page);
    await page.getByRole("button", { name: "Adressbücher" }).click();
    await expect(
      page.getByRole("list", { name: "Meine Adressbücher" }).getByText("Meine Kontakte"),
    ).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Teilen: Meine Kontakte" }).click();
    await expect(page.getByRole("dialog").getByLabel("Anna Weber")).toHaveValue("none");
  });

  test("Weitere Kontakte und Zusammenführen", async ({ page }) => {
    await login(page);
    await openContacts(page);
    await page.getByRole("link", { name: "Weitere Kontakte" }).click();
    await expect(page.getByRole("heading", { name: "Weitere Kontakte" })).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Kontakte suchen", exact: true }),
    ).toBeHidden();
    await page.getByRole("main").getByRole("link", { name: "Kontakte" }).click();

    await page.getByRole("link", { name: /Zusammenführen und korrigieren/ }).click();
    await expect(
      page.getByRole("heading", { name: "Zusammenführen und korrigieren" }),
    ).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: "Kontakte" }).click();
    await expect(page.getByRole("searchbox", { name: "Kontakte suchen" })).toBeVisible();
  });
});

/** Cards straight into Jonas' default address book, behind the UI's back. */
const addContacts = async (cards: Record<string, unknown>[]) => {
  const client = jmapAs("jonas");
  const accountId = await personalAccountId("jonas");
  const book = (await listAddressBooks(client, accountId)).find((b) => b.isDefault)!;
  for (const card of cards) await createContact(client, accountId, book.id, card);
};

const named = (given: string, surname: string) => ({
  name: {
    components: [
      { kind: "given", value: given },
      { kind: "surname", value: surname },
    ],
    isOrdered: true,
  },
});

test.describe("Weitere Kontakte", () => {
  test("zeigt, mit wem man Mails hatte, und nimmt ihn in die Kontakte auf", async ({ page }) => {
    const id = Date.now().toString(36);
    const name = `Nora Neukunde ${id}`;
    const email = `nora-${id}@kunde.test`;
    await addMail("jonas", "jonas", unique("Anfrage Heizung"), { name, email });
    await login(page);
    await page.goto("/contacts");
    await page.getByRole("link", { name: "Weitere Kontakte" }).click();
    await expect(page.getByRole("heading", { name: "Weitere Kontakte" })).toBeVisible();

    const list = page.getByRole("list", { name: "Weitere Kontakte" });
    const nora = list.getByRole("listitem", { name });
    await expect(nora).toContainText(email);
    await expect(nora).toContainText("1 Mail");
    // Contacts and colleagues are not "other" contacts.
    await expect(list.getByRole("listitem", { name: "Petra Keller" })).toHaveCount(0);
    await expect(list.getByRole("listitem", { name: "Anna Weber" })).toHaveCount(0);

    await nora.getByRole("button", { name: "Zu Kontakten hinzufügen" }).click();
    await expect(page.getByRole("status")).toHaveText(`${name} steht jetzt in Ihren Kontakten.`);
    await expect(nora).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(`Nora Neukunde ${id}`) })).toBeVisible();
  });
});

test.describe("Zusammenführen und korrigieren", () => {
  test("führt doppelte Kontakte zusammen, auch in ihren Gruppen", async ({ page }) => {
    const id = Date.now().toString(36);
    const surname = `Doppel ${id}`;
    const group = `Baustelle ${id}`;
    await addContacts([
      {
        uid: `ina-a-${id}`,
        ...named("Ina", surname),
        emails: { e: { address: `ina-${id}@doppel.test` } },
      },
      {
        uid: `ina-b-${id}`,
        ...named("Ina", surname),
        emails: { e: { address: `INA-${id}@doppel.test` } },
        phones: { p: { number: "+49 7223 9900" } },
        organizations: { o: { name: "Doppel GmbH" } },
      },
      { kind: "group", name: { full: group }, members: { [`ina-a-${id}`]: true } },
    ]);
    await login(page);
    await page.goto("/contacts");
    await page.getByRole("link", { name: /Zusammenführen und korrigieren/ }).click();

    const set = page.getByRole("article", { name: `Ina ${surname}` });
    await expect(set).toContainText("2 Kontakte · gleiche E-Mail-Adresse, gleicher Name");
    await set.getByRole("button", { name: "Zusammenführen" }).click();
    await expect(page.getByRole("status")).toHaveText(`Ina ${surname} zusammengeführt.`);
    await expect(set).toHaveCount(0);

    // One card with everything, and the group lists it.
    await expect(page.getByRole("link", { name: new RegExp(`Ina ${surname}`) })).toHaveCount(1);
    await page.getByRole("link", { name: new RegExp(`Ina ${surname}`) }).click();
    await expect(page.getByText("+49 7223 9900")).toBeVisible();
    await page
      .getByRole("list", { name: "Gruppen" })
      .getByRole("link", { name: new RegExp(group) })
      .click();
    await expect(
      page.getByRole("list", { name: "Mitglieder" }).getByRole("link", { name: /Ina Doppel/ }),
    ).toHaveCount(1);
  });

  test("korrigiert einen Namen in Großbuchstaben und merkt sich Ignoriertes", async ({ page }) => {
    const id = Date.now().toString(36).toUpperCase();
    await addContacts([
      named("KARL", `KRAUSE${id}`),
      named("Udo", `Zweimal ${id.toLowerCase()}`),
      named("Udo", `Zweimal ${id.toLowerCase()}`),
    ]);
    await login(page);
    await page.goto("/contacts?manage=cleanup");

    const fix = page.getByRole("listitem", { name: `KARL KRAUSE${id}` });
    await expect(fix).toContainText(`Karl Krause${id.toLowerCase()}`);
    await fix.getByRole("button", { name: "Übernehmen" }).click();
    await expect(page.getByRole("status")).toHaveText(`Karl Krause${id.toLowerCase()} korrigiert.`);
    await expect(fix).toHaveCount(0);

    const udo = page.getByRole("article", { name: `Udo Zweimal ${id.toLowerCase()}` });
    await udo.getByRole("button", { name: "Ignorieren" }).click();
    await expect(udo).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Zusammenführen und korrigieren" }),
    ).toBeVisible();
    await expect(udo).toHaveCount(0);
  });
});
