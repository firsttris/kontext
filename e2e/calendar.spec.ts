import { expect, test } from "@playwright/test";
import {
  addAttendees,
  inboxSubjects,
  jmapAs,
  login,
  personalAccountId,
  showKeyboard,
  unique,
} from "./helpers";

const CALENDARS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];

/** The alerts of a person's events with a title, read behind the UI's back. */
const alertsOf = async (user: string, title: string) => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const { list } = await client.call<{
    list: {
      title: string;
      alerts: Record<string, { trigger: { offset: string }; action: string }> | null;
    }[];
  }>("CalendarEvent/get", { accountId, properties: ["title", "alerts"] }, CALENDARS);
  return Object.values(list.find((event) => event.title === title)?.alerts ?? {}).map(
    ({ trigger, action }) => ({ offset: trigger.offset, action }),
  );
};

/** Day and time (Berlin) some minutes from now, on a whole minute. */
const minutesAhead = (minutes: number) => {
  const at = new Date(Math.ceil((Date.now() + minutes * 60_000) / 60_000) * 60_000);
  const local = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    dateStyle: "short",
    timeStyle: "short",
  }).format(at);
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
};

type Stored = {
  id: string;
  uid: string;
  title: string;
  start: string;
  duration: string;
  description: string | null;
  locations: Record<string, { name: string }> | null;
  participants: Record<string, { calendarAddress: string }> | null;
};

/** A person's events with a title, read behind the UI's back, earliest first. */
const eventsTitled = async (user: string, title: string): Promise<Stored[]> => {
  const { list } = await jmapAs(user).call<{ list: Stored[] }>(
    "CalendarEvent/get",
    {
      accountId: await personalAccountId(user),
      properties: ["uid", "title", "start", "duration", "description", "locations", "participants"],
    },
    CALENDARS,
  );
  return list
    .filter((event) => event.title === title)
    .sort((a, b) => a.start.localeCompare(b.start));
};

const removeEvents = async (user: string, events: Stored[]) =>
  jmapAs(user).call(
    "CalendarEvent/set",
    { accountId: await personalAccountId(user), destroy: events.map((event) => event.id) },
    CALENDARS,
  );

/** What a copy must have like its original. */
const details = ({ title, duration, description, locations, participants }: Stored) => ({
  title,
  time: duration,
  description,
  place: Object.values(locations ?? {}).map((place) => place.name),
  people: Object.values(participants ?? {})
    .map((person) => person.calendarAddress)
    .sort(),
});

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

  test("dupliziert einen Termin auf einen anderen Tag", async ({ page }) => {
    const title = unique("Wartung Heizung");
    await login(page);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T14:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    await dialog.getByLabel("Ende Uhrzeit").fill("15:30");
    await dialog.getByLabel("Ort").fill("Lindenweg 7");
    await dialog.getByLabel("Notizen").fill("Schlüssel beim Nachbarn");
    await addAttendees(dialog, "anna@weber-haustechnik.test");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);

    await page.locator(`[data-day="${tomorrow()}"]`).getByText(title).click();
    await dialog.getByRole("button", { name: "Duplizieren" }).click();
    await expect(dialog.getByRole("heading", { name: "Termin duplizieren" })).toBeVisible();
    await expect(dialog.getByLabel("Titel")).toHaveValue(title);
    await expect(dialog.getByLabel("Beginn Datum")).toHaveValue(tomorrow());
    await dialog.getByLabel("Beginn Datum").fill(day(2));
    // The end moves along, so the copy is as long as the original.
    await expect(dialog.getByLabel("Ende Datum")).toHaveValue(day(2));
    await expect(dialog.getByLabel("Ende Uhrzeit")).toHaveValue("15:30");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Einladungen werden verschickt.");
    await expect(dialog).toHaveCount(0);

    await page.goto(`/calendar?date=${day(2)}`);
    await expect(page.locator(`[data-day="${day(2)}"]`).getByText(title)).toBeVisible();
    await expect(page.locator(`[data-day="${tomorrow()}"]`).getByText(title)).toBeVisible();
    const [original, copy] = await eventsTitled("jonas", title);
    try {
      expect(original!.start).toBe(`${tomorrow()}T14:00:00`);
      expect(copy!.start).toBe(`${day(2)}T14:00:00`);
      expect(copy!.uid).not.toBe(original!.uid);
      expect(details(copy!)).toEqual(details(original!));
      expect(details(copy!)).toMatchObject({
        time: "PT1H30M",
        place: ["Lindenweg 7"],
        people: ["mailto:anna@weber-haustechnik.test", "mailto:jonas@weber-haustechnik.test"],
      });
    } finally {
      await removeEvents("jonas", [original!, copy!].filter(Boolean));
    }
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

  test("Erinnerung per Mail: Stalwart schickt sie zur gewählten Zeit, auch ohne offene App", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    const title = unique("Rückruf Hoffmann");
    // Five minutes before a start in six to seven minutes: the mail is due in one to two.
    const { date, time } = minutesAhead(6);
    await login(page);
    await page.goto(`/calendar?date=${date}&event=new&start=${date}T${time}`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    await expect(dialog.getByLabel("Erinnerung")).toHaveValue("15");
    await dialog.getByLabel("Erinnerung").selectOption({ label: "5 Minuten vorher" });
    await dialog.getByLabel("Erinnern per").selectOption({ label: "Mail" });
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await alertsOf("jonas", title)).toEqual([{ offset: "-PT5M", action: "email" }]);

    // Opened again, the editor shows what was chosen.
    await page.locator(`[data-day="${date}"]`).getByText(title).click();
    await page.getByRole("dialog").getByRole("button", { name: "Bearbeiten" }).click();
    await expect(page.getByRole("dialog").getByLabel("Erinnerung")).toHaveValue("5");
    await expect(page.getByRole("dialog").getByLabel("Erinnern per")).toHaveValue("email");
    await page.close();

    await expect
      .poll(async () => (await inboxSubjects("jonas")).some((subject) => subject.includes(title)), {
        timeout: 200_000,
        intervals: [5000],
      })
      .toBe(true);
  });

  test("ein Kalender gibt neuen Terminen seine Erinnerung mit", async ({ page }) => {
    const calendar = unique("Baustellen");
    const title = unique("Estrich prüfen");
    await login(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    const manage = page.getByRole("dialog", { name: "Kalender verwalten" });
    await manage.getByLabel("Name des Kalenders").fill(calendar);
    await manage.getByRole("button", { name: "Anlegen" }).click();
    await manage.getByRole("button", { name: `Erinnerung: ${calendar}` }).click();
    const defaults = page.getByRole("dialog", { name: `Erinnerung für „${calendar}“` });
    await expect(defaults.getByLabel("Termine mit Uhrzeit")).toHaveValue("none");
    await defaults.getByLabel("Termine mit Uhrzeit").selectOption({ label: "1 Tag vorher" });
    await defaults.getByLabel("Erinnern per").selectOption({ label: "Mail" });
    await defaults.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status")).toHaveText("Erinnerung gespeichert.");
    await page.keyboard.press("Escape");

    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T10:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    // The usual 15 minutes in the default calendar; the calendar's own in the new one.
    await expect(dialog.getByLabel("Erinnerung")).toHaveValue("15");
    await dialog.getByLabel("Kalender", { exact: true }).selectOption({ label: calendar });
    await expect(dialog.getByLabel("Erinnerung")).toHaveValue("1440");
    await expect(dialog.getByLabel("Erinnern per")).toHaveValue("email");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);
    expect(await alertsOf("jonas", title)).toEqual([{ offset: "-P1D", action: "email" }]);

    await page.goto("/calendar");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    page.once("dialog", (confirm) => void confirm.accept());
    await manage.getByRole("button", { name: `Kalender löschen: ${calendar}` }).click();
    await expect(manage.getByText(calendar)).toHaveCount(0);
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
    // The dialog closes once the series is stored; navigating earlier cuts off the save.
    await expect(dialog).toHaveCount(0);

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

  test("ändert eine Serie ab einem Termin und löscht ab einem Termin", async ({ page }) => {
    const title = unique("Montageplanung");
    await login(page);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T07:30`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").fill(title);
    await dialog.getByLabel("Wiederholen").selectOption("daily");
    await dialog.getByLabel("Endet").selectOption("count");
    await dialog.getByLabel("Anzahl Termine").fill("5");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog).toHaveCount(0);

    await page.goto(`/calendar?date=${tomorrow()}&view=agenda`);
    const list = page.getByRole("list", { name: "Liste" });
    await expect(list.getByText(title, { exact: true })).toHaveCount(5);

    // From the third date on, a new title: two stay as they were, the series still has five.
    await list.getByText(title, { exact: true }).nth(2).click();
    await page.getByRole("dialog").getByRole("button", { name: "Bearbeiten" }).click();
    await page.getByRole("dialog").getByLabel("Dieser und alle folgenden").check();
    await page.getByRole("dialog").getByLabel("Titel").fill(`${title} Baustelle`);
    await page.getByRole("dialog").getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(list.getByText(title, { exact: true })).toHaveCount(2);
    await expect(list.getByText(`${title} Baustelle`)).toHaveCount(3);

    // From the new series' second date on, gone; its first stays.
    await list.getByText(`${title} Baustelle`).nth(1).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Diesen und alle folgenden löschen" })
      .click();
    await expect(list.getByText(`${title} Baustelle`)).toHaveCount(1);
    await expect(list.getByText(title, { exact: true })).toHaveCount(2);
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
    await expect(page.getByRole("link", { name: "Tag", exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("heute bleibt im kleinen Monat weiß auf Blau, auch als Tag eines anderen Monats (dunkel)", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await login(page);
    // Today on the 28th: November's small month starts on Monday the 26th of October.
    await page.clock.setFixedTime(new Date("2026-10-28T10:00:00+01:00"));
    await page.goto("/calendar?date=2026-11-10");
    const cell = page.getByRole("link", { name: "Mittwoch, 28. Oktober 2026", exact: true });
    await expect(cell).toHaveCSS("background-color", "rgb(37, 99, 235)");
    await expect(cell).toHaveCSS("color", "rgb(255, 255, 255)");
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

test.describe("Feiertage", () => {
  test("Max trägt die Feiertage des Saarlands ein, ein zweites Mal ergänzt nichts", async ({
    page,
  }) => {
    const christmas = `${today().slice(0, 4)}-12-25`;
    await login(page, "max");
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    const manage = page.getByRole("dialog", { name: "Kalender verwalten" });
    await manage.getByLabel("Bundesland").selectOption({ label: "Saarland" });
    await manage.getByRole("button", { name: "Feiertage eintragen" }).click();
    // Twelve days in the Saarland, this year and next.
    await expect(
      page.getByRole("status").filter({ hasText: "24 Feiertage eingetragen." }),
    ).toBeVisible();
    // The calendar's line, not its entry in "Aus Datei übernehmen"'s list of calendars.
    await expect(
      manage.getByRole("listitem").filter({ hasText: "Feiertage Saarland" }),
    ).toBeVisible();
    await manage.getByRole("button", { name: "Feiertage eintragen" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Die Feiertage stehen schon im Kalender." }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    await page.goto(`/calendar?date=${christmas}&view=day`);
    await expect(page.getByText("1. Weihnachtstag")).toBeVisible();

    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    page.once("dialog", (confirm) => confirm.accept());
    await manage.getByRole("button", { name: "Kalender löschen: Feiertage Saarland" }).click();
    await expect(manage.getByText("Feiertage Saarland")).toHaveCount(0);
  });
});

/** An export with a weekly series, one of its dates moved, and a day off; UIDs unique per run. */
const icsFile = (run: string, year: number) => `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Kontext e2e//DE
METHOD:PUBLISH
BEGIN:VEVENT
UID:${run}-series@e2e
DTSTAMP:20261001T100000Z
DTSTART;TZID=Europe/Berlin:${year}0304T090000
DTEND;TZID=Europe/Berlin:${year}0304T100000
RRULE:FREQ=WEEKLY;COUNT=4
SUMMARY:Lieferantenrunde ${run}
END:VEVENT
BEGIN:VEVENT
UID:${run}-series@e2e
DTSTAMP:20261001T100000Z
RECURRENCE-ID;TZID=Europe/Berlin:${year}0311T090000
DTSTART;TZID=Europe/Berlin:${year}0311T140000
DTEND;TZID=Europe/Berlin:${year}0311T150000
SUMMARY:Lieferantenrunde verschoben ${run}
END:VEVENT
BEGIN:VEVENT
UID:${run}-day@e2e
DTSTAMP:20261001T100000Z
DTSTART;VALUE=DATE:${year}0320
DTEND;VALUE=DATE:${year}0321
SUMMARY:Betriebsausflug ${run}
END:VEVENT
BEGIN:VEVENT
UID:${run}-known@e2e
DTSTAMP:20261001T100000Z
DTSTART;TZID=Europe/Berlin:${year}0305T080000
DTEND;TZID=Europe/Berlin:${year}0305T083000
SUMMARY:Schon da ${run}
END:VEVENT
END:VCALENDAR
`;

test.describe("Termine aus Datei", () => {
  test("übernimmt eine .ics-Datei mit Vorschau, was schon da ist, bleibt aus", async ({ page }) => {
    test.setTimeout(60_000);
    const run = Date.now().toString(36);
    const year = Number(today().slice(0, 4)) + 1;
    const calendar = unique("Lieferanten");
    // One appointment of the file is already in Jonas' account (in another calendar).
    const client = jmapAs("jonas");
    const accountId = await personalAccountId("jonas");
    const { list } = await client.call<{ list: { id: string; isDefault: boolean }[] }>(
      "Calendar/get",
      { accountId },
      CALENDARS,
    );
    const known = await client.call<{ created: Record<string, { id: string }> }>(
      "CalendarEvent/set",
      {
        accountId,
        sendSchedulingMessages: false,
        create: {
          k: {
            uid: `${run}-known@e2e`,
            title: `Schon da ${run}`,
            calendarIds: { [list.find((c) => c.isDefault)!.id]: true },
            start: `${year}-03-05T08:00:00`,
            timeZone: "Europe/Berlin",
            duration: "PT30M",
          },
        },
      },
      CALENDARS,
    );

    await login(page);
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    const manage = page.getByRole("dialog", { name: "Kalender verwalten" });
    await manage.getByLabel("Name des Kalenders").fill(calendar);
    await manage.getByRole("button", { name: "Anlegen" }).click();
    const row = manage.getByRole("listitem").filter({ hasText: calendar });
    await expect(row).toBeVisible();

    const file = { name: "termine.ics", mimeType: "text/calendar" };
    await manage.getByLabel("In Kalender", { exact: true }).selectOption({ label: calendar });
    await manage
      .getByLabel("Datei (.ics)", { exact: true })
      .setInputFiles({ ...file, buffer: Buffer.from(icsFile(run, year)) });
    await expect(manage.getByText("2 neu, 1 schon vorhanden")).toBeVisible();
    const preview = manage.getByRole("list", { name: "Aus Datei übernehmen" });
    await expect(preview.getByRole("listitem")).toHaveCount(3);
    await expect(
      preview.getByRole("listitem").filter({ hasText: `Lieferantenrunde ${run}` }),
    ).toContainText("Serie");
    await expect(
      preview.getByRole("listitem").filter({ hasText: `Schon da ${run}` }),
    ).toContainText("schon vorhanden");
    await manage.getByRole("button", { name: "Übernehmen" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "2 Termine übernommen." }),
    ).toBeVisible();

    // The same file again: nothing new.
    await manage
      .getByLabel("Datei (.ics)", { exact: true })
      .setInputFiles({ ...file, buffer: Buffer.from(icsFile(run, year)) });
    await expect(manage.getByText("0 neu, 3 schon vorhanden")).toBeVisible();
    await expect(manage.getByRole("button", { name: "Übernehmen" })).toBeDisabled();
    await page.keyboard.press("Escape");

    // The series keeps its moved date.
    const moved = `${year}-03-11`;
    await page.goto(`/calendar?date=${moved}&view=day`);
    await expect(
      page.locator(`[data-day="${moved}"]`).getByText(`Lieferantenrunde verschoben ${run}`),
    ).toBeVisible();
    await page.goto(`/calendar?date=${year}-03-18&view=day`);
    await expect(
      page.locator(`[data-day="${year}-03-18"]`).getByText(`Lieferantenrunde ${run}`),
    ).toBeVisible();

    await page.getByRole("button", { name: "Kalender verwalten" }).first().click();
    page.once("dialog", (confirm) => confirm.accept());
    await manage.getByRole("button", { name: `Kalender löschen: ${calendar}` }).click();
    await expect(row).toHaveCount(0);
    await client.call(
      "CalendarEvent/set",
      { accountId, destroy: [known.created.k!.id] },
      CALENDARS,
    );
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
    await login(page);
    await page.getByRole("link", { name: "Kalender" }).click();
    const add = page.getByRole("link", { name: "Neuer Termin", exact: true });
    await expect(add).toBeVisible();
    const visibleBottom = await showKeyboard(page, 330);
    await expect
      .poll(async () => {
        const box = (await add.boundingBox())!;
        return box.y + box.height;
      })
      .toBeLessThanOrEqual(visibleBottom);
  });

  test("ein Feld unten im Termin-Sheet bleibt über der Tastatur sichtbar", async ({ page }) => {
    await login(page);
    await page.goto(`/calendar?event=new&start=${today()}T17:00`);
    const dialog = page.getByRole("dialog");
    const notes = dialog.getByLabel("Notizen");
    await expect(notes).toBeVisible();
    // The keyboard comes up, the page gets shorter, and Chrome scrolls the field into view.
    const visibleBottom = await showKeyboard(page, 330);
    await notes.focus();
    await expect
      .poll(async () => {
        const field = (await notes.boundingBox())!;
        const frame = (await dialog.boundingBox())!;
        return (
          field.y >= frame.y - 1 &&
          field.y + field.height <= frame.y + frame.height + 1 &&
          field.y + field.height <= visibleBottom
        );
      })
      .toBe(true);
  });

  test("Termin mit Erinnerung eine Stunde vorher", async ({ page }) => {
    const title = unique("Ablesung Zähler");
    await login(page);
    await page.goto(`/calendar?event=new&start=${tomorrow()}T10:00`);
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Titel").fill(title);
    await sheet.getByLabel("Erinnerung").selectOption({ label: "1 Stunde vorher" });
    await sheet.getByRole("button", { name: "Speichern" }).click();
    await expect(sheet).toHaveCount(0);
    expect(await alertsOf("jonas", title)).toEqual([{ offset: "-PT1H", action: "display" }]);
  });

  test("löscht eine Serie ab einem Termin", async ({ page }) => {
    const title = unique("Frühschicht");
    await login(page);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T06:00`);
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Titel").fill(title);
    await sheet.getByLabel("Wiederholen").selectOption("daily");
    await sheet.getByLabel("Endet").selectOption("count");
    await sheet.getByLabel("Anzahl Termine").fill("3");
    await sheet.getByRole("button", { name: "Speichern" }).click();
    await expect(sheet).toHaveCount(0);
    await page.goto(`/calendar?date=${tomorrow()}&view=agenda`);
    const list = page.getByRole("list", { name: "Liste" });
    await expect(list.getByText(title)).toHaveCount(3);
    await list.getByText(title).nth(1).click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Diesen und alle folgenden löschen" })
      .click();
    await expect(list.getByText(title)).toHaveCount(1);
  });

  test("dupliziert einen Termin", async ({ page }) => {
    const title = unique("Kundendienst");
    await login(page);
    await page.goto(`/calendar?date=${tomorrow()}&event=new&start=${tomorrow()}T08:00`);
    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("Titel").fill(title);
    await sheet.getByLabel("Ort").fill("Mühlenstraße 3");
    await sheet.getByRole("button", { name: "Speichern" }).click();
    await expect(sheet).toHaveCount(0);
    await page.goto(`/calendar?date=${tomorrow()}&view=agenda`);
    const list = page.getByRole("list", { name: "Liste" });
    await list.getByText(title).click();
    await sheet.getByRole("button", { name: "Duplizieren" }).click();
    await sheet.getByLabel("Beginn Datum").fill(day(3));
    await sheet.getByRole("button", { name: "Speichern" }).click();
    await expect(sheet).toHaveCount(0);
    await expect(list.getByText(title)).toHaveCount(2);
    const events = await eventsTitled("jonas", title);
    try {
      expect(events.map((event) => event.start)).toEqual([
        `${tomorrow()}T08:00:00`,
        `${day(3)}T08:00:00`,
      ]);
      expect(details(events[1]!)).toEqual(details(events[0]!));
    } finally {
      await removeEvents("jonas", events);
    }
  });

  test("Kalender verwalten", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Kalender" }).click();
    await page.getByRole("button", { name: "Kalender verwalten" }).click();
    // The calendar's line, not its entry in "Aus Datei übernehmen"'s list of calendars.
    await expect(
      page.getByRole("dialog").getByRole("listitem").filter({ hasText: "Mein Kalender" }),
    ).toBeVisible();
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
    // Chrome on an Android tablet: the keyboard makes the page shorter, and the dialog sits in
    // the middle of what is left, not as a bottom sheet.
    await login(page);
    await page.goto(`/calendar?event=new&start=${today()}T17:00`);
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Titel").focus();
    const visibleBottom = await showKeyboard(page, 500);
    await expect
      .poll(async () => {
        const box = (await dialog.boundingBox())!;
        return box.y + box.height;
      })
      .toBeLessThanOrEqual(visibleBottom);
    await expect(dialog.getByLabel("Titel")).toBeInViewport();
  });

  test("ein Feld unten im Dialog bleibt über der Tastatur sichtbar", async ({ page }) => {
    // The dialog gets shorter with the app; a field near its end must scroll into what is left,
    // not stay cut off below the dialog's edge.
    await login(page);
    await page.goto(`/calendar?event=new&start=${today()}T17:00`);
    const dialog = page.getByRole("dialog");
    const notes = dialog.getByLabel("Notizen");
    await expect(notes).toBeVisible();
    const visibleBottom = await showKeyboard(page, 500);
    await notes.focus();
    await expect
      .poll(async () => {
        const field = (await notes.boundingBox())!;
        const frame = (await dialog.boundingBox())!;
        return (
          field.y >= frame.y - 1 &&
          field.y + field.height <= frame.y + frame.height + 1 &&
          field.y + field.height <= visibleBottom
        );
      })
      .toBe(true);
  });
});
