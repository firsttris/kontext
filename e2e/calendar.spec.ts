import { expect, test } from "@playwright/test";
import { addAttendees, fakeKeyboard, login, showKeyboard, unique } from "./helpers";

const day = (offset: number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );
const today = () => day(0);
/** Invitations are only sent for future events, so that test plans for tomorrow. */
const tomorrow = () => day(1);

test.describe("Kalender", () => {
  test("zeigt die Woche mit den Terminen", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kalender" }).first().click();
    await expect(page.getByText(/KW \d+/)).toBeVisible();
    await expect(
      page.locator(`[data-day="${today()}"]`).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
  });

  test("legt einen Termin mit Einladung an, Anna sagt zu", async ({ page, browser }) => {
    test.setTimeout(90_000);
    const title = unique("Abnahme Bad");
    await login(page);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T15:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    await dialog.getByLabel("Ort").fill("Hauptstraße 41");
    await addAttendees(dialog, "anna@weber-haustechnik.test");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Einladungen werden verschickt.");
    const block = page.locator(`[data-day="${tomorrow()}"]`).getByText(title);
    await expect(block).toBeVisible();

    // Anna sees the invitation and accepts it.
    const anna = await (
      await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" })
    ).newPage();
    await login(anna, "anna");
    // Delivery to Anna's calendar runs in the background on the server.
    await expect
      .poll(
        async () => {
          await anna.goto(`/calendar?date=${tomorrow()}`);
          return anna
            .locator(`[data-day="${tomorrow()}"]`)
            .getByText(title)
            .waitFor({ timeout: 3_000 })
            .then(() => true)
            .catch(() => false);
        },
        { timeout: 30_000 },
      )
      .toBe(true);
    await anna.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
    await anna.getByRole("button", { name: "Zusagen" }).click();
    await expect(anna.getByRole("button", { name: "Zusagen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    // Jonas sees the answer.
    await expect
      .poll(
        async () => {
          await page.goto(`/calendar?date=${tomorrow()}`);
          await page.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
          const text = (await page.getByRole("list", { name: "Teilnehmer" }).textContent()) ?? "";
          await page.keyboard.press("Escape");
          return text;
        },
        { timeout: 20_000 },
      )
      .toMatch(/anna@weber-haustechnik\.test\s*zugesagt/);
  });

  test("ändert und löscht einen Termin", async ({ page }) => {
    const title = unique("Telefonat");
    await login(page);
    await page.goto(`/calendar?event=new&start=${today()}T17:00`);
    await page.getByRole("dialog").getByLabel("Titel").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    const day = page.locator(`[data-day="${today()}"]`);
    await day.getByText(title).click();
    await page.getByRole("dialog").getByRole("button", { name: "Bearbeiten" }).click();
    await page.getByRole("dialog").getByLabel("Titel").fill(`${title} verschoben`);
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    await expect(day.getByText(`${title} verschoben`)).toBeVisible();
    await day.getByText(`${title} verschoben`).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Termin löschen", exact: true })
      .click();
    await expect(day.getByText(`${title} verschoben`)).toHaveCount(0);
  });

  test("legt eine Terminserie an, ändert und löscht einzelne Termine", async ({ page }) => {
    const title = unique("Wochenrunde");
    await login(page);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T08:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    await dialog.getByLabel("Wiederholen").selectOption("weekly");
    await dialog.getByLabel("Endet").selectOption("count");
    await dialog.getByLabel("Anzahl Termine").fill("3");
    await dialog.getByRole("button", { name: "Speichern" }).click();

    await page.goto(`/calendar?date=${tomorrow()}&view=agenda`);
    const list = page.getByRole("list", { name: "Liste" });
    await expect(list.getByText(title)).toHaveCount(3);

    // Only the second date gets a new title.
    await list.getByText(title).nth(1).click();
    await expect(page.getByRole("dialog").getByText("Wöchentlich, 3-mal")).toBeVisible();
    await page.getByRole("dialog").getByRole("button", { name: "Bearbeiten" }).click();
    await expect(page.getByRole("dialog").getByLabel("Nur dieser Termin")).toBeChecked();
    await page.getByRole("dialog").getByLabel("Titel").fill(`${title} mit Kunde`);
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    await expect(list.getByText(`${title} mit Kunde`)).toHaveCount(1);
    await expect(list.getByText(title, { exact: true })).toHaveCount(2);

    // The first date is skipped, then the whole series goes.
    await list.getByText(title, { exact: true }).first().click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Nur diesen Termin löschen" })
      .click();
    await expect(list.getByText(title, { exact: true })).toHaveCount(1);
    await list.getByText(title, { exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Serie löschen" }).click();
    await expect(page.getByText(title)).toHaveCount(0);
  });

  test("verschiebt einen Termin per Ziehen und ändert seine Länge", async ({ page }) => {
    const title = unique("Kundentermin");
    await login(page);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T10:00`);
    await page.getByRole("dialog").getByLabel("Titel").fill(title);
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    const column = page.locator(`[data-day="${tomorrow()}"]`);
    const block = column.getByRole("link", { name: new RegExp(title) });
    await expect(block).toContainText("10:00–11:00");

    // One hour down (56 px per hour).
    const box = (await block.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 10);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 40, { steps: 4 });
    await page.mouse.move(box.x + box.width / 2, box.y + 66, { steps: 4 });
    await expect(page.getByTestId("drag-preview")).toContainText("11:00–12:00");
    await page.mouse.up();
    await expect(page.getByRole("status")).toHaveText("Termin verschoben.");
    await expect(block).toContainText("11:00–12:00");
    await expect(page.getByRole("dialog")).toHaveCount(0);

    // Pull the lower edge half an hour further. The block shows the new length at once and saves
    // it in the background; the reload below waits for the save, or it would cut it off.
    const saved = page.waitForResponse((response) =>
      (response.request().postData() ?? "").includes('"duration":"PT1H30M"'),
    );
    const moved = (await block.boundingBox())!;
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height - 3);
    await page.mouse.down();
    await page.mouse.move(moved.x + moved.width / 2, moved.y + moved.height + 27, { steps: 6 });
    await page.mouse.up();
    await expect(block).toContainText("11:00–12:30");
    expect((await saved).ok()).toBe(true);

    // It is stored: after a reload it is still there.
    await page.reload();
    await expect(column.getByRole("link", { name: new RegExp(title) })).toContainText(
      "11:00–12:30",
    );
  });

  test("zeigt den Monat", async ({ page }) => {
    await login(page);
    await page.goto("/calendar");
    await page.getByRole("link", { name: "Monat" }).click();
    await expect(
      page.locator(`[data-month-day="${today()}"]`).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
    await page.getByRole("link", { name: today(), exact: true }).click();
    await expect(page.getByRole("link", { name: "Tag" })).toHaveAttribute("aria-pressed", "true");
  });

  test("zeigt die wöchentliche Teambesprechung aus den Testdaten", async ({ page }) => {
    await login(page);
    await page.goto("/calendar?view=agenda");
    const meetings = page.getByRole("list", { name: "Liste" }).getByRole("link", {
      name: /Teambesprechung/,
    });
    await expect(meetings).toHaveCount(4);
    await meetings.first().click();
    await expect(page.getByRole("dialog").getByText("Wöchentlich, 12-mal")).toBeVisible();
  });

  test("prüft die Eingaben", async ({ page }) => {
    await login(page);
    await page.goto(`/calendar?event=new&start=${today()}T10:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Bitte einen Titel angeben.");
    await dialog.getByLabel("Titel").fill("Test");
    await dialog.getByLabel("Ende Uhrzeit").fill("09:00");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByRole("alert")).toHaveText("Das Ende liegt vor dem Beginn.");
  });
});

test.describe("Kalender teilen", () => {
  test("Jonas teilt einen Kalender mit Anna, erst zum Bearbeiten, dann nur zum Lesen", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const calendar = unique("Baustellen");
    const title = unique("Estrich");
    await login(page);
    await page.goto("/calendar");

    // A new calendar, shared with Anna to edit.
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    const manage = page.getByRole("dialog", { name: "Kalender verwalten" });
    await manage.getByLabel("Name des Kalenders").fill(calendar);
    await manage.getByRole("button", { name: "Anlegen" }).click();
    await manage.getByRole("button", { name: `Teilen: ${calendar}` }).click();
    const share = page.getByRole("dialog", { name: `„${calendar}“ teilen` });
    await share.getByLabel("Anna Weber").selectOption("edit");
    await share.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Freigabe gespeichert.");
    await expect(
      manage
        .getByRole("listitem")
        .filter({ hasText: calendar })
        .getByText("Geteilt mit Anna Weber"),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // An appointment in it.
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T11:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    await dialog.getByLabel("Kalender", { exact: true }).selectOption({ label: calendar });
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.locator(`[data-day="${tomorrow()}"]`).getByText(title)).toBeVisible();

    // Anna sees it in her calendar and moves it to 12:00.
    const anna = await (
      await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" })
    ).newPage();
    await login(anna, "anna");
    await anna.goto(`/calendar?date=${tomorrow()}`);
    const annaCalendar = anna.locator("label").filter({ hasText: calendar });
    await expect(annaCalendar).toContainText("Jonas Weber · Darf bearbeiten");
    const annaDay = anna.locator(`[data-day="${tomorrow()}"]`);
    await annaDay.getByText(title).click();
    await expect(
      anna.getByRole("dialog").getByText(`Kalender: ${calendar} · Jonas Weber`),
    ).toBeVisible();
    await anna.getByRole("dialog").getByRole("button", { name: "Bearbeiten" }).click();
    await anna.getByRole("dialog").getByLabel("Beginn Uhrzeit").fill("12:00");
    await anna.getByRole("dialog").getByLabel("Ende Uhrzeit").fill("13:00");
    await anna.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    await expect(annaDay.getByRole("link", { name: new RegExp(title) })).toContainText(
      "12:00–13:00",
    );

    // She can hide it.
    await anna.getByLabel(`${calendar} anzeigen`).uncheck();
    await expect(annaDay.getByText(title)).toHaveCount(0);
    await anna.getByLabel(`${calendar} anzeigen`).check();
    await expect(annaDay.getByText(title)).toBeVisible();

    // Jonas sees her change and makes it read-only.
    await page.goto(`/calendar?date=${tomorrow()}`);
    await expect(
      page.locator(`[data-day="${tomorrow()}"]`).getByRole("link", { name: new RegExp(title) }),
    ).toContainText("12:00–13:00");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    await manage.getByRole("button", { name: `Teilen: ${calendar}` }).click();
    await share.getByLabel("Anna Weber").selectOption("read");
    await share.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Freigabe gespeichert.");

    await anna.reload();
    await expect(annaCalendar).toContainText("Jonas Weber · Nur lesen");
    await annaDay.getByText(title).click();
    await expect(
      anna.getByRole("dialog").getByText("Von Jonas Weber geteilt, nur zum Lesen."),
    ).toBeVisible();
    await expect(anna.getByRole("dialog").getByRole("button", { name: "Bearbeiten" })).toHaveCount(
      0,
    );
    await anna.keyboard.press("Escape");

    // Deleting the calendar removes it for both.
    page.once("dialog", (confirm) => confirm.accept());
    await manage.getByRole("button", { name: `Kalender löschen: ${calendar}` }).click();
    await expect(manage.getByText(calendar)).toHaveCount(0);
    await anna.reload();
    await expect(annaDay.getByText(title)).toHaveCount(0);
  });
});

test.describe("Kalender am Handy @phone", () => {
  test("Tagesansicht mit Wochenleiste und neuem Termin", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kalender" }).click();
    await expect(page.getByRole("navigation", { name: "Woche" })).toBeVisible();
    await expect(page.getByText("Baubesprechung Hoffmann")).toBeVisible();
    await page.getByRole("link", { name: "Neuer Termin", exact: true }).click();
    await expect(page.getByRole("dialog").getByLabel("Titel")).toBeVisible();
  });

  test("„Neuer Termin“ bleibt über der Tastatur", async ({ page }) => {
    await fakeKeyboard(page);
    await login(page);
    await page.getByRole("link", { name: "Kalender" }).click();
    const add = page.getByRole("link", { name: "Neuer Termin", exact: true });
    await expect(add).toBeVisible();
    const keyboard = 330;
    await showKeyboard(page, keyboard);
    const visibleBottom = (await page.evaluate(() => window.innerHeight)) - keyboard;
    await expect
      .poll(async () => {
        const box = (await add.boundingBox())!;
        return box.y + box.height;
      })
      .toBeLessThanOrEqual(visibleBottom);
  });

  test("Kalender verwalten", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kalender" }).click();
    await page.getByRole("button", { name: "Kalender verwalten" }).click();
    await expect(page.getByRole("dialog").getByText("Mein Kalender")).toBeVisible();
    await expect(page.getByRole("dialog").getByLabel("Mein Kalender anzeigen")).toBeChecked();
  });

  test("Liste der nächsten Termine", async ({ page }) => {
    await login(page);
    await page.goto("/calendar");
    await page.getByRole("link", { name: "Liste" }).click();
    await expect(
      page.getByRole("list", { name: "Liste" }).getByText("Baubesprechung Hoffmann"),
    ).toBeVisible();
  });
});

test.describe("Kalender am Tablet", () => {
  test.use({ viewport: { width: 800, height: 1280 }, hasTouch: true });

  test("der Termin-Dialog bleibt über der Tastatur", async ({ page }) => {
    // Chrome on an Android tablet: the keyboard lies over the page (VirtualKeyboard API), and the
    // dialog sits in the middle, not as a bottom sheet.
    await fakeKeyboard(page);
    await login(page);
    await page.goto(`/calendar?event=new&start=${today()}T17:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").focus();
    const keyboard = 500;
    await showKeyboard(page, keyboard);
    const visibleBottom = (await page.evaluate(() => window.innerHeight)) - keyboard;
    await expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!;
        return box.y + box.height;
      })
      .toBeLessThanOrEqual(visibleBottom);
    await expect(dialog.getByLabel("Titel")).toBeInViewport();
  });
});
