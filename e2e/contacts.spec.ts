import { expect, test } from "@playwright/test";
import { login, unique } from "./helpers";

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
  test("Liste und Kontakt", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kontakte" }).click();
    await page.getByRole("link", { name: /Petra Keller/ }).click();
    await expect(page.getByRole("heading", { name: "Petra Keller" })).toBeVisible();
    await page.getByRole("link", { name: "Kontakte", exact: true }).first().click();
    await expect(page.getByRole("searchbox", { name: "Kontakte suchen" })).toBeVisible();
  });

  test("Adressbücher", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kontakte" }).click();
    await page.getByRole("button", { name: "Adressbücher" }).click();
    await expect(page.getByRole("dialog").getByText("Meine Kontakte")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Teilen: Meine Kontakte" }).click();
    await expect(page.getByRole("dialog").getByLabel("Anna Weber")).toHaveValue("none");
  });
});
