import { expect, type Page, test } from "@playwright/test";
import { address, login, unique } from "./helpers";
import { deliverMail } from "./protocols";

type ApiTask = {
  id: string;
  title: string;
  projectId: string | null;
  status: string;
  dueDate: string | null;
  repeat: string | null;
};

const serverTasks = (page: Page): Promise<ApiTask[]> =>
  page.evaluate(async () => (await (await fetch("/api/tasks")).json()).tasks);

const personalId = (page: Page) =>
  page.evaluate(
    async () =>
      (await (await fetch("/jmap/session")).json()).primaryAccounts[
        "urn:ietf:params:jmap:mail"
      ] as string,
  );

const day = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

test.describe("Aufgaben: eigene Spalten und Wiederholung", () => {
  test("eine eigene Spalte anlegen, benutzen und wieder löschen", async ({ page }) => {
    const title = unique("Fliesen Hoffmann");
    await login(page);
    const me = await personalId(page);
    await page.goto(`/tasks?board=${me}&mode=board`);
    await page.getByRole("button", { name: "Spalten" }).click();
    const dialog = page.getByRole("dialog", { name: /^Spalten von/ });
    await dialog.getByRole("button", { name: "Spalte hinzufügen" }).click();
    await dialog.getByLabel("Name der Spalte 4").fill("Bestellt");
    await dialog.getByRole("button", { name: "„Bestellt“ nach links" }).click();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Spalten gespeichert." }),
    ).toBeVisible();

    const bestellt = page.getByRole("region", { name: "Bestellt" });
    await expect(bestellt).toBeVisible();
    await bestellt.getByRole("button", { name: "Aufgabe in „Bestellt“" }).click();
    await bestellt.getByRole("textbox", { name: "Aufgabe in „Bestellt“" }).fill(title);
    await page.keyboard.press("Enter");
    await expect(bestellt).toContainText(title);
    await expect
      .poll(async () => (await serverTasks(page)).find((t) => t.title === title)?.status)
      .toBe("c-bestellt");

    // Removed again: its task goes back to "Offen".
    await page.getByRole("button", { name: "Spalten" }).click();
    await dialog.getByRole("button", { name: "„Bestellt“ löschen" }).click();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("region", { name: "Bestellt" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Offen" })).toContainText(title);
  });

  test("ein Board für ein Projekt: Aufgaben bleiben für sich, gelöscht kommen sie zurück", async ({
    page,
  }) => {
    const board = unique("Baustelle Hoffmann");
    const renamed = `${board} Bad`;
    const title = unique("Rohre bestellen");
    await login(page);
    await page.goto("/tasks");
    await page.getByRole("button", { name: "Neues Board" }).click();
    const dialog = page.getByRole("dialog", { name: "Neues Board" });
    await dialog.getByLabel("Name").fill(board);
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    await expect(page.getByRole("heading", { name: board, level: 1 })).toBeVisible();

    const open = page.getByRole("region", { name: "Offen" });
    await open.getByRole("button", { name: "Aufgabe in „Offen“" }).click();
    await open.getByRole("textbox", { name: "Aufgabe in „Offen“" }).fill(title);
    await page.keyboard.press("Enter");
    await expect(open).toContainText(title);
    await expect
      .poll(async () => (await serverTasks(page)).find((t) => t.title === title)?.projectId)
      .toMatch(/^p-/);

    // Not on the mailbox's own board.
    const me = await personalId(page);
    await page.goto(`/tasks?board=${me}&mode=board`);
    await expect(page.getByRole("heading", { name: "Mein Board", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Offen" })).not.toContainText(title);

    // Renamed, then deleted: its task comes onto "Mein Board".
    await page.getByRole("link", { name: new RegExp(board) }).click();
    await page.getByRole("button", { name: "Board bearbeiten" }).click();
    const edit = page.getByRole("dialog", { name: "Board bearbeiten" });
    await edit.getByLabel("Name").fill(renamed);
    await edit.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("heading", { name: renamed, level: 1 })).toBeVisible();
    await page.getByRole("button", { name: "Board bearbeiten" }).click();
    await edit.getByRole("button", { name: "Board löschen" }).click();
    await expect(edit).toContainText("Die Aufgaben darauf kommen auf „Mein Board“.");
    await edit.getByRole("button", { name: "Wirklich löschen?" }).click();
    await expect(page.getByRole("heading", { name: "Mein Board", level: 1 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Offen" })).toContainText(title);
    await expect(page.getByRole("link", { name: new RegExp(renamed) })).toHaveCount(0);
  });

  test("ein neues Board am Handy, über die Chips @phone", async ({ page }) => {
    const board = unique("Wartung Schule");
    const title = unique("Filter tauschen");
    await login(page, "max");
    await page.getByRole("link", { name: "Aufgaben" }).click();
    await page.getByRole("button", { name: "Neues Board" }).click();
    const dialog = page.getByRole("dialog", { name: "Neues Board" });
    await dialog.getByLabel("Name").fill(board);
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    await expect(page.getByRole("heading", { name: board, level: 1 })).toBeVisible();
    await page.getByRole("link", { name: "Liste" }).click();
    await page.getByRole("textbox", { name: "Neue Aufgabe" }).fill(title);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await page.getByRole("link", { name: "Meine Aufgaben", exact: true }).click();
    await page.getByRole("link", { name: board, exact: true }).click();
    await expect(page.getByRole("heading", { name: board, level: 1 })).toBeVisible();
  });

  test("eine wiederkehrende Aufgabe kommt erledigt wieder", async ({ page }) => {
    const title = unique("Zählerstand ablesen");
    await login(page);
    const response = await page.request.post("/api/tasks", {
      data: { accountId: await personalId(page), title, dueDate: day(), repeat: "weekly" },
    });
    const { task } = (await response.json()) as { task: ApiTask };
    await page.goto(`/tasks?task=${task.id}`);
    const detail = page.getByRole("article", { name: title });
    await expect(detail.getByRole("combobox", { name: /^Wiederholen/ })).toHaveValue("weekly");
    await expect(detail).toContainText("Erledigt kommt sie wieder");
    await detail.getByRole("button", { name: "Erledigt", exact: true }).first().click();
    await expect
      .poll(async () => (await serverTasks(page)).filter((t) => t.title === title).length)
      .toBe(2);
    const next = (await serverTasks(page)).find((t) => t.title === title && t.status === "open");
    expect(next).toMatchObject({ dueDate: day(7), repeat: "weekly" });
    await page.getByRole("link", { name: "Demnächst" }).first().click();
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
  });

  test("eine Regel legt aus einer neuen Mail eine Aufgabe an", async ({ page }) => {
    const token = unique("Reklamation");
    await login(page, "max");
    await page.goto("/settings?section=rules");
    await page.getByRole("button", { name: "Neue Regel" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Regel" });
    await dialog.getByLabel("Feld").selectOption("subject");
    await dialog.getByLabel("Wert").fill(token);
    await dialog.getByLabel("Aufgabe anlegen").check();
    await dialog.getByRole("button", { name: "Regel speichern" }).click();
    await expect(page.getByRole("list", { name: "Regeln" })).toContainText("Aufgabe anlegen");

    await deliverMail({
      from: "kunde@example.test",
      fromName: "Petra Kunde",
      to: address("max"),
      subject: `AW: ${token} Heizung`,
      body: "Die Heizung ist wieder kalt.",
    });
    await expect
      .poll(
        async () => {
          const task = (await serverTasks(page)).find((t) => t.title === `${token} Heizung`);
          return task
            ? [task.status, (task as unknown as { links: { kind: string }[] }).links[0]?.kind]
            : null;
        },
        { timeout: 20_000 },
      )
      .toEqual(["open", "mail"]);
    // In the list, with the mail it came from.
    await page.goto("/tasks");
    await expect(page.getByRole("link", { name: new RegExp(token) })).toContainText("Petra Kunde");

    await page.goto("/settings?section=rules");
    await page.getByRole("button", { name: new RegExp(token) }).click();
    const edit = page.getByRole("dialog", { name: "Regel bearbeiten" });
    await edit.getByRole("button", { name: "Regel löschen" }).click();
    await edit.getByRole("button", { name: "Wirklich löschen?" }).click();
  });
});
