/** Renaming and recolouring a calendar, renaming an address book, moving a contact between books. */
import { expect, type Page, test } from "@playwright/test";
import { createCalendar, deleteCalendar, listCalendars } from "../src/jmap/calendar";
import {
  createAddressBook,
  createContact,
  deleteAddressBook,
  deleteContact,
  listAddressBooks,
  listContacts,
} from "../src/jmap/contacts";
import { jmapAs, login, personalAccountId, unique } from "./helpers";

/** Desktop and phone run at the same time against one Stalwart. */
const named = (text: string) => unique(`${text} ${test.info().project.name}`);

const renamesAndRecoloursACalendar = async (page: Page) => {
  const jonas = jmapAs("jonas");
  const accountId = await personalAccountId("jonas");
  const before = named("Baustellen");
  const after = named("Montage");
  const id = await createCalendar(jonas, accountId, { name: before });
  try {
    await login(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    const manage = page.getByRole("dialog", { name: "Kalender verwalten" });
    await manage.getByRole("button", { name: `Name und Farbe: ${before}` }).click();
    const edit = page.getByRole("dialog", { name: `„${before}“ bearbeiten` });
    await edit.getByLabel("Name des Kalenders").fill(after);
    await edit.getByRole("button", { name: "Rot" }).click();
    await expect(edit.getByRole("button", { name: "Rot" })).toHaveAttribute("aria-pressed", "true");
    await edit.getByRole("button", { name: "Speichern" }).click();
    await expect(edit).toHaveCount(0);
    await expect(manage.getByText(after)).toBeVisible();
    await expect
      .poll(async () => {
        const calendar = (await listCalendars(jonas, accountId)).find((c) => c.id === id);
        return [calendar?.name, calendar?.color];
      })
      .toEqual([after, "#dc2626"]);
  } finally {
    await deleteCalendar(jonas, accountId, id);
  }
};

const renamesABookAndMovesAContact = async (page: Page) => {
  const jonas = jmapAs("jonas");
  const accountId = await personalAccountId("jonas");
  const before = named("Lieferanten");
  const after = named("Großhandel");
  const surname = named("Umzug").replaceAll(" ", "");
  const book = await createAddressBook(jonas, accountId, before);
  const main = (await listAddressBooks(jonas, accountId)).find((b) => b.isDefault)!.id;
  const card = await createContact(jonas, accountId, main, {
    name: {
      components: [
        { kind: "given", value: "Ida" },
        { kind: "surname", value: surname },
      ],
      isOrdered: true,
    },
  });
  try {
    await login(page);
    await page.goto("/contacts");

    await page.getByRole("button", { name: "Adressbücher" }).click();
    await page
      .getByRole("dialog", { name: "Adressbücher" })
      .getByRole("button", { name: `Umbenennen: ${before}` })
      .click();
    const rename = page.getByRole("dialog", { name: `„${before}“ umbenennen` });
    await rename.getByLabel("Name des Adressbuchs").fill(after);
    await rename.getByRole("button", { name: "Speichern" }).click();
    const books = page.getByRole("dialog", { name: "Adressbücher" });
    await expect(books.getByRole("list", { name: "Meine Adressbücher" })).toContainText(after);
    await page.keyboard.press("Escape");

    await page.getByRole("searchbox", { name: "Kontakte suchen" }).fill(surname);
    await page.getByRole("link", { name: new RegExp(surname) }).click();
    await page.getByRole("button", { name: "Verschieben nach …" }).click();
    await page.getByRole("menuitem", { name: after }).click();
    await expect(page.getByRole("status")).toHaveText(`Nach „${after}“ verschoben.`);
    await expect
      .poll(async () => (await listContacts(jonas, accountId, book)).map((c) => c.id))
      .toEqual([card]);
    expect((await listContacts(jonas, accountId, main)).some((c) => c.id === card)).toBe(false);
  } finally {
    await deleteContact(jonas, accountId, card).catch(() => undefined);
    await deleteAddressBook(jonas, accountId, book);
  }
};

test.describe("Umbenennen und Verschieben", () => {
  test("Kalender umbenennen und umfärben", ({ page }) => renamesAndRecoloursACalendar(page));
  test("Adressbuch umbenennen, Kontakt verschieben", ({ page }) =>
    renamesABookAndMovesAContact(page));
});

test.describe("Umbenennen und Verschieben am Handy @phone", () => {
  test("Kalender umbenennen und umfärben", ({ page }) => renamesAndRecoloursACalendar(page));
  test("Adressbuch umbenennen, Kontakt verschieben", ({ page }) =>
    renamesABookAndMovesAContact(page));
});
