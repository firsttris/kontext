import { expect, type Page, test } from "@playwright/test";
import { addMail, login, unique } from "./helpers";

type ApiTask = {
  title: string;
  status: string;
  accountId: string;
  assigneeId: string | null;
  links: { kind: string }[];
};

/** The tasks as the server has them, asked from the signed-in page. */
const serverTasks = (page: Page): Promise<ApiTask[]> =>
  page.evaluate(async () => (await (await fetch("/api/tasks")).json()).tasks);

const taskOf = async (page: Page, title: string) =>
  (await serverTasks(page)).find((task) => task.title === title);

test.describe("Aufgaben", () => {
  test("Schnelleingabe mit Datum, Details und abhaken", async ({ page }) => {
    const name = unique("Heizlast Lang rechnen");
    await login(page);
    await page.getByRole("link", { name: "Aufgaben", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "Meine Aufgaben" })).toBeVisible();
    await page.getByRole("textbox", { name: "Neue Aufgabe" }).fill(`${name} morgen`);
    await page.keyboard.press("Enter");
    const week = page.getByRole("list", { name: "Diese Woche" });
    await expect(week.getByRole("link", { name: new RegExp(name) })).toContainText("Morgen");

    await week.getByRole("link", { name: new RegExp(name) }).click();
    const detail = page.getByRole("article", { name });
    await detail.getByRole("button", { name: "In Arbeit" }).click();
    await detail.getByRole("textbox", { name: "Schritt hinzufügen" }).fill("Grundriss prüfen");
    await page.keyboard.press("Enter");
    await detail.getByLabel("Notiz").fill("160 m², Fußbodenheizung");
    await detail.getByLabel("Zuständig").click(); // leave the notes field: saved
    await expect(detail).toContainText("Checkliste · 0 von 1");
    await expect.poll(async () => (await taskOf(page, name))?.status).toBe("doing");

    // The row moves into "Erledigt" (a new element), so a click rather than check().
    await page.getByRole("checkbox", { name: `„${name}“ erledigt` }).click();
    await expect.poll(async () => (await taskOf(page, name))?.status).toBe("done");
    // Still in the list for today, struck through under "Erledigt".
    await expect(page.getByRole("list", { name: "Erledigt" })).toContainText(name);
    await page.getByRole("link", { name: "Erledigt", exact: true }).click();
    await expect(page.getByRole("list", { name: "Erledigt" })).toContainText(name);
  });

  test("Aufgabe aus einer Mail in info@, im Team-Board sichtbar und gezogen", async ({
    page,
    browser,
  }) => {
    const subject = unique("Anfrage Fußbodenheizung");
    await addMail("jonas", "info", subject);
    await login(page);
    await page.getByRole("link", { name: "info@" }).click();
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: "Aufgabe aus dieser Mail" });
    await expect(dialog.getByLabel("Titel")).toHaveValue(subject);
    await expect(dialog.getByLabel("Postfach")).toHaveValue(/.+/);
    await dialog.getByRole("button", { name: "Morgen" }).click();
    await dialog.getByLabel("Zuständig").selectOption({ label: "Niemand" });
    await dialog.getByRole("button", { name: "Aufgabe erstellen" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Aufgabe angelegt." })).toBeVisible();

    // The mail knows its task, in the reading pane and in the list.
    await expect(page.getByRole("link", { name: new RegExp(`Aufgabe: ${subject}`) })).toBeVisible();
    await expect(
      page
        .getByRole("list", { name: "Posteingang" })
        .getByRole("link", { name: new RegExp(subject) }),
    ).toContainText("Aufgabe");
    const created = await taskOf(page, subject);
    expect(created?.links.map((link) => link.kind)).toEqual(["mail"]);

    // Anna, member of info@, finds it on the board and drags it to "In Arbeit".
    const anna = await (await browser.newContext()).newPage();
    await login(anna, "anna");
    await anna.goto(`/tasks?board=${created!.accountId}`);
    const open = anna.getByRole("region", { name: "Offen" });
    const doing = anna.getByRole("region", { name: "In Arbeit" });
    await expect(open.getByRole("link", { name: new RegExp(subject) })).toBeVisible();
    await open.getByRole("link", { name: new RegExp(subject) }).dragTo(doing);
    await expect(doing.getByRole("link", { name: new RegExp(subject) })).toBeVisible();
    await expect.poll(async () => (await taskOf(anna, subject))?.status).toBe("doing");

    // Back from the task to its mail.
    await anna
      .getByRole("link", { name: new RegExp(subject) })
      .first()
      .click();
    await anna
      .getByRole("article", { name: subject })
      .getByRole("link", { name: new RegExp(subject) })
      .click();
    await expect(anna.getByRole("heading", { name: subject })).toBeVisible();
  });
});

test.describe("Aufgaben am Handy @phone", () => {
  test("legt eine Aufgabe für heute an und öffnet sie @phone", async ({ page }) => {
    const name = unique("Rückruf Bauamt");
    await login(page, "max");
    await page.getByRole("link", { name: "Aufgaben" }).click();
    await page.getByRole("link", { name: "Heute", exact: true }).click();
    await page.getByRole("textbox", { name: "Neue Aufgabe" }).fill(name);
    await page.keyboard.press("Enter");
    // In "Heute" a task without a typed day is due today.
    await page
      .getByRole("list", { name: "Heute" })
      .getByRole("link", { name: new RegExp(name) })
      .click();
    await expect(page.getByRole("article", { name })).toBeVisible();
    await page.getByRole("button", { name: "Zurück" }).click();
    await expect(page.getByRole("heading", { name: "Heute", level: 1 })).toBeVisible();
  });
});
