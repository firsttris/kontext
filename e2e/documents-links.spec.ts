import { expect, type Page, test } from "@playwright/test";
import { address, login, unique } from "./helpers";

/**
 * Files of Dokumente where they belong in Kontext: as a card in the chat, linked to a task, and
 * with an appointment. Each time Kontext shares the file with the people there, to view
 * (the stand-in for Schreibzeug, dev/fake-schreibzeug.ts, records it).
 */
const SCHREIBZEUG = "http://localhost:28096";

/** A file in someone's Dokumente, made directly at the stand-in. */
const fileOf = async (page: Page, owner: string, name: string): Promise<string> => {
  const response = await page.request.post(`${SCHREIBZEUG}/e2e/files`, {
    data: { owner: address(owner), name },
  });
  return ((await response.json()) as { id: string }).id;
};

/** Whom the stand-in says the file is shared with, and how. */
const sharesOf = async (page: Page, id: string) =>
  (await page.request.get(`${SCHREIBZEUG}/e2e/shares/${id}`)).json();

const tomorrow = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + 86_400_000),
  );

test.describe("Dokumente in Chat, Aufgaben und Terminen", () => {
  test("teilt ein Dokument im Chat; die Mitglieder dürfen es ansehen", async ({ page }) => {
    const name = `${unique("Aufmaß Bad")}.xlsx`;
    await login(page);
    const id = await fileOf(page, "jonas", name);
    const channel = unique("Baustelle");
    await page.getByRole("link", { name: /^Chat/ }).first().click();
    await page.getByRole("button", { name: "Neue Nachricht" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
    await dialog.getByRole("tab", { name: "Kanal" }).click();
    await dialog.getByLabel("Name des Kanals").fill(channel);
    await dialog.getByText("Max Becker").click();
    await dialog.getByRole("button", { name: "Kanal anlegen" }).click();

    await page.getByRole("button", { name: "Mail, Aufgabe oder Kontakt verknüpfen" }).click();
    const picker = page.getByRole("dialog", { name: "Mail, Aufgabe oder Kontakt verknüpfen" });
    await picker.getByRole("tab", { name: "Dokument" }).click();
    await picker.getByRole("button", { name }).click();
    await page.getByRole("textbox", { name: "Nachricht" }).fill("Das Aufmaß fürs Bad");
    await page.keyboard.press("Enter");

    const card = page
      .getByRole("list", { name: "Nachrichten" })
      .getByRole("link", { name: /Dokument/ });
    await expect(card).toContainText(name);
    await expect.poll(() => sharesOf(page, id)).toEqual({ [address("max")]: "view" });
    await card.click();
    await expect(page).toHaveURL(new RegExp(`/documents/edit/${id}$`));
  });

  test("verknüpft ein Dokument mit einer Aufgabe; der Zuständige darf es ansehen", async ({
    page,
  }) => {
    const title = unique("Angebot Lang prüfen");
    const name = `${unique("Angebot Lang")}.docx`;
    await login(page);
    const id = await fileOf(page, "jonas", name);
    await page.getByRole("link", { name: "Aufgaben", exact: true }).first().click();
    await page.getByRole("textbox", { name: "Neue Aufgabe" }).fill(title);
    await page.keyboard.press("Enter");
    await page
      .getByRole("link", { name: new RegExp(title) })
      .first()
      .click();
    const detail = page.getByRole("article", { name: title });
    await detail.getByLabel("Zuständig").selectOption({ label: "Anna Weber" });

    await detail.getByRole("button", { name: "Dokument verknüpfen" }).click();
    await page
      .getByRole("dialog", { name: "Dokument wählen" })
      .getByRole("button", { name })
      .click();
    await expect(detail.getByRole("link", { name })).toBeVisible();
    await expect.poll(() => sharesOf(page, id)).toEqual({ [address("anna")]: "view" });
    await detail.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`/documents/edit/${id}$`));
  });

  test("hängt ein Dokument an einen Termin; die Eingeladenen dürfen es ansehen", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const title = unique("Baubesprechung Lang");
    const name = `${unique("Tagesordnung")}.docx`;
    await login(page);
    const id = await fileOf(page, "jonas", name);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T10:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    await dialog.getByLabel("Teilnehmer").fill(`${address("anna")}, kunde@example.org`);
    await dialog.getByRole("button", { name: "Dokument verknüpfen" }).click();
    await page
      .getByRole("dialog", { name: "Dokument wählen" })
      .getByRole("button", { name })
      .click();
    await expect(dialog.getByText(name)).toBeVisible();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    // Only colleagues: people outside cannot sign in to Dokumente.
    await expect.poll(() => sharesOf(page, id)).toEqual({ [address("anna")]: "view" });

    // Stalwart keeps it as the appointment's link; the details open it in Dokumente.
    await page.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
    const documents = page.getByRole("list", { name: "Dokumente" });
    await documents.getByRole("link", { name }).click();
    await expect(page).toHaveURL(new RegExp(`/documents/edit/${id}$`));
  });
});
