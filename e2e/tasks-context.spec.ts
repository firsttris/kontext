import { expect, type Page, test } from "@playwright/test";
import { browserKeys, decryptPayload } from "../server/push/receive";
import { fakePushService } from "./fake-push";
import { addMail, login, unique } from "./helpers";

type ApiTask = {
  id: string;
  title: string;
  status: string;
  remindAt: string | null;
  links: { kind: string; label: string }[];
};

const serverTasks = (page: Page): Promise<ApiTask[]> =>
  page.evaluate(async () => (await (await fetch("/api/tasks")).json()).tasks);

const taskOf = async (page: Page, title: string) =>
  (await serverTasks(page)).find((task) => task.title === title);

const personalId = (page: Page) =>
  page.evaluate(
    async () =>
      (await (await fetch("/jmap/session")).json()).primaryAccounts[
        "urn:ietf:params:jmap:mail"
      ] as string,
  );

/** A day in the company's time zone, days from today. */
const day = (offset = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

const createTask = async (page: Page, task: Record<string, unknown>) => {
  const response = await page.request.post("/api/tasks", {
    data: { accountId: await personalId(page), ...task },
  });
  expect(response.status()).toBe(201);
  return ((await response.json()) as { task: ApiTask }).task;
};

test.describe("Aufgaben im Kontext", () => {
  test("am Kontakt: aus der Mail des Kontakts und direkt am Kontakt", async ({ page }) => {
    const fromMail = unique("Angebot Bad nachfassen");
    const atContact = unique("Fliesen bestellen");
    await login(page);
    // His mail, opened from his card (it lies in "Kunden/Hoffmann").
    const openContact = async () => {
      await page.getByRole("link", { name: "Kontakte" }).first().click();
      await page.getByRole("link", { name: /Markus Hoffmann/ }).click();
    };
    await openContact();
    await page.getByRole("link", { name: /Re: Badsanierung Obergeschoss/ }).click();
    await expect(
      page.getByRole("heading", { name: "Re: Badsanierung Obergeschoss" }),
    ).toBeVisible();
    await page.keyboard.press("t");
    const dialog = page.getByRole("dialog", { name: "Aufgabe aus dieser Mail" });
    await expect(dialog).toContainText("und Markus Hoffmann");
    await dialog.getByLabel("Titel").fill(fromMail);
    await dialog.getByRole("button", { name: "Aufgabe erstellen" }).click();
    await expect
      .poll(async () => (await taskOf(page, fromMail))?.links.map((l) => l.kind).sort())
      .toEqual(["contact", "mail"]);

    await openContact();
    const tasks = page.getByRole("region", { name: "Aufgaben" });
    await expect(tasks).toContainText(fromMail);
    await tasks.getByRole("button", { name: "Aufgabe" }).click();
    const own = page.getByRole("dialog", { name: "Aufgabe zu Markus Hoffmann" });
    await own.getByLabel("Titel").fill(atContact);
    await own.getByRole("button", { name: "Morgen" }).click();
    await own.getByRole("button", { name: "Aufgabe erstellen" }).click();
    await expect(tasks.getByRole("link", { name: new RegExp(atContact) })).toContainText("Morgen");

    // Ticked off in place; it opens in the tasks app.
    await tasks.getByRole("checkbox", { name: `„${fromMail}“ erledigt` }).click();
    await expect.poll(async () => (await taskOf(page, fromMail))?.status).toBe("done");
    await tasks.getByRole("link", { name: new RegExp(atContact) }).click();
    await expect(page.getByRole("article", { name: atContact })).toBeVisible();
  });

  test("„Aufgaben erstellen“ für mehrere Mails, danach archiviert", async ({ page }) => {
    const subjects = [unique("Rechnung Lang"), unique("Rechnung Weber")];
    for (const subject of subjects) await addMail("jonas", "jonas", subject);
    await login(page);
    for (const subject of subjects) {
      await page.getByRole("checkbox", { name: `„${subject}“ auswählen` }).click();
    }
    await page.getByRole("button", { name: "Aufgaben erstellen" }).click();
    const dialog = page.getByRole("dialog", { name: "2 Aufgaben aus diesen Mails" });
    await expect(dialog).toContainText(subjects[0]!);
    await dialog.getByRole("button", { name: "Heute" }).click();
    await dialog.getByLabel("Mails danach archivieren").check();
    await dialog.getByRole("button", { name: "2 Aufgaben erstellen" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "2 Aufgaben angelegt." }),
    ).toBeVisible();
    for (const subject of subjects) {
      await expect
        .poll(async () => (await taskOf(page, subject))?.links.map((link) => link.kind))
        .toContain("mail");
      await expect(page.getByRole("list", { name: "Posteingang" }).getByText(subject)).toHaveCount(
        0,
      );
    }
  });

  test("im Kalender: fällig am Tag, Überfälliges heute, abhaken mit Rückgängig", async ({
    page,
  }) => {
    const due = unique("Abnahme Hoffmann");
    const late = unique("Rückruf Lang");
    await login(page);
    await createTask(page, { title: due, dueDate: day(), dueTime: "15:30" });
    await createTask(page, { title: late, dueDate: day(-3) });
    await page.getByRole("link", { name: "Kalender" }).first().click();
    await page.getByRole("link", { name: "Woche", exact: true }).click();
    const chip = page.getByRole("link", { name: new RegExp(due) });
    await expect(chip).toContainText("15:30");
    // At its time in the grid, not with the all-day appointments.
    await expect(page.getByTestId("timed-task").filter({ hasText: due })).toBeVisible();
    await expect(page.getByTestId("timed-task").filter({ hasText: late })).toHaveCount(0);
    await expect(page.getByRole("link", { name: new RegExp(late) })).toContainText("überfällig");

    await page.getByRole("button", { name: `„${due}“ erledigt` }).click();
    await expect(chip).toHaveCount(0);
    await page
      .getByRole("status")
      .filter({ hasText: `„${due}“ erledigt.` })
      .getByRole("button", { name: "Rückgängig" })
      .click();
    await expect(chip).toBeVisible();
    await expect.poll(async () => (await taskOf(page, due))?.status).toBe("open");

    // Switched off under the calendars, and on again.
    await page.getByRole("checkbox", { name: /Fällige Aufgaben/ }).uncheck();
    await expect(chip).toHaveCount(0);
    await page.getByRole("checkbox", { name: /Fällige Aufgaben/ }).check();
    await chip.click();
    await expect(page.getByRole("article", { name: due })).toBeVisible();
  });

  test("Erinnern: Auswahl nach Fälligkeit, zieht mit, wenn sich der Tag ändert", async ({
    page,
  }) => {
    const title = unique("Zählerstand melden");
    await login(page);
    const task = await createTask(page, { title, dueDate: day(2), dueTime: "14:00" });
    await page.goto(`/tasks?task=${task.id}`);
    const detail = page.getByRole("article", { name: title });
    const remind = detail.getByRole("combobox", { name: /^Erinnern/ });
    await remind.selectOption({ label: "15 Minuten vorher" });
    await expect(remind).toHaveValue("15");
    await expect.poll(async () => (await taskOf(page, title))?.remindAt).toBeTruthy();
    const first = new Date((await taskOf(page, title))!.remindAt!).getTime();

    await detail.getByLabel("Uhrzeit").fill("16:00");
    await expect
      .poll(async () => new Date((await taskOf(page, title))!.remindAt!).getTime())
      .toBe(first + 2 * 3_600_000);
    await expect(remind).toHaveValue("15");
  });

  test("Glocke und Push: neu zugewiesen und Erinnerung", async ({ page, browser }) => {
    test.setTimeout(60_000);
    const service = await fakePushService();
    const keys = await browserKeys();
    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    const endpoint = `${service.url}/max-tasks-${Date.now()}`;
    await max.request.post("/api/push/subscriptions", {
      data: { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } },
    });
    const pushes = async () =>
      Promise.all(
        service.received
          .filter((push) => endpoint.endsWith(push.path))
          .map(async (push) => JSON.parse(await decryptPayload(new Uint8Array(push.body), keys))),
      );

    const given = unique("Angebot Keller prüfen");
    const remind = unique("Lieferung annehmen");
    await login(page);
    const maxId = await personalId(max);
    await createTask(page, { title: given, assigneeId: maxId, dueDate: day(1) });
    await expect.poll(pushes).toContainEqual(
      expect.objectContaining({
        title: "Jonas Weber hat dir eine Aufgabe gegeben",
        body: expect.stringContaining(given),
      }),
    );
    // Due today, with a reminder in a moment: the server sends it.
    const task = await createTask(page, {
      title: remind,
      assigneeId: maxId,
      dueDate: day(),
      remindAt: new Date(Date.now() + 1500).toISOString(),
    });
    await expect.poll(pushes, { timeout: 15_000 }).toContainEqual({
      title: `Erinnerung: ${remind}`,
      body: expect.stringMatching(/^Fällig /),
      url: `/tasks?task=${task.id}`,
      tag: `task-${task.id}`,
    });

    // Max's bell: given to him (new, with a dot), and due today.
    await max.reload();
    const bell = max.getByRole("button", { name: /^Benachrichtigungen, \d+ neu$/ });
    await bell.click();
    const popup = max.getByRole("dialog", { name: "Benachrichtigungen" });
    const fresh = popup.getByRole("region", { name: "Neu für dich" });
    await expect(fresh.getByRole("link", { name: new RegExp(given) })).toContainText(
      "von Jonas Weber",
    );
    await expect(fresh.getByRole("link", { name: new RegExp(remind) })).toBeVisible();
    await fresh.getByRole("link", { name: new RegExp(given) }).click();
    // On Jonas' own board, yet Max may do it.
    const article = max.getByRole("article", { name: given });
    await expect(article.getByRole("combobox", { name: /^Postfach/ })).toBeDisabled();
    await article.getByRole("button", { name: "Erledigt", exact: true }).first().click();
    await expect.poll(async () => (await taskOf(max, given))?.status).toBe("done");
    service.close();
    await max.context().close();
  });

  test("am Handy: fällige Aufgaben in der Liste des Kalenders @phone", async ({ page }) => {
    const title = unique("Material abholen");
    await login(page);
    await createTask(page, { title, dueDate: day(1) });
    await page.goto("/calendar?view=agenda");
    const agenda = page.getByRole("list", { name: "Liste" });
    await expect(agenda.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await agenda.getByRole("button", { name: `„${title}“ erledigt` }).click();
    await expect(agenda.getByRole("link", { name: new RegExp(title) })).toHaveCount(0);
  });
});
