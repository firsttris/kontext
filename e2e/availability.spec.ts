import { type Browser, expect, type Page, test } from "@playwright/test";
import { createJmapClient } from "../src/jmap/client";
import { newEmployee, stamp } from "./company-helpers";
import {
  addAttendees,
  address,
  jmapAs,
  login,
  personalAccountId,
  STALWART,
  unique,
} from "./helpers";

const CALENDARS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];

/** A Wednesday at least a week ahead, away from the seeded appointments of this week. */
const wednesday = () => {
  const date = new Date(Date.now() + 7 * 86_400_000);
  while (date.getUTCDay() !== 3) date.setUTCDate(date.getUTCDate() + 1);
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(date);
};

/** An appointment in a colleague's own calendar, made behind the UI's back; removes itself. */
const busyAt = async (user: string, day: string, time: string, duration: string) => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const { list } = await client.call<{ list: { id: string; isDefault: boolean }[] }>(
    "Calendar/get",
    { accountId },
    CALENDARS,
  );
  const calendar = list.find((c) => c.isDefault) ?? list[0]!;
  const { created } = await client.call<{ created: Record<string, { id: string }> }>(
    "CalendarEvent/set",
    {
      accountId,
      create: {
        e: {
          calendarIds: { [calendar.id]: true },
          title: unique("Kundentermin"),
          start: `${day}T${time}:00`,
          timeZone: "Europe/Berlin",
          duration,
        },
      },
    },
    CALENDARS,
  );
  return () => client.call("CalendarEvent/set", { accountId, destroy: [created.e!.id] }, CALENDARS);
};

/** A fresh browser signed in as `user`, beside the test's own page. */
const signedIn = async (browser: Browser, user: string) => {
  const page = await (
    await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" })
  ).newPage();
  await login(page, user);
  return page;
};

/** The titles in a colleague's calendars on a day, read behind the UI's back. */
const titlesOf = async (user: string, day: string): Promise<string[]> => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const [, get] = await client.request(
    [
      [
        "CalendarEvent/query",
        { accountId, filter: { after: `${day}T00:00:00Z`, before: `${day}T23:59:59Z` } },
        "q",
      ],
      [
        "CalendarEvent/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "CalendarEvent/query", path: "/ids" },
          properties: ["title"],
        },
        "g",
      ],
    ],
    CALENDARS,
  );
  return ((get![1].list as { title?: string }[]) ?? []).map((event) => event.title ?? "");
};

const newMeetingWithAnna = async (page: Page, day: string) => {
  await login(page);
  await page.goto(`/calendar?date=${day}&event=new&start=${day}T10:00`);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill(unique("Baubesprechung"));
  await addAttendees(dialog, "anna@weber-haustechnik.test, kunde@example.test");
  return dialog;
};

test.describe("Verfügbarkeit", () => {
  test("zeigt, dass Anna belegt ist, und schlägt eine freie Zeit vor", async ({ page }) => {
    const day = wednesday();
    const remove = await busyAt("anna", day, "09:30", "PT2H");
    try {
      const dialog = await newMeetingWithAnna(page, day);
      const planning = dialog.getByRole("region", { name: "Verfügbarkeit" });
      await expect(planning.getByText("Anna ist zu dieser Zeit belegt.")).toBeVisible();
      await expect(planning.getByText("Belegt bis 11:30")).toBeVisible();
      await expect(
        planning.getByRole("listitem").filter({ hasText: "kunde@example.test" }),
      ).toContainText("Keine Info");

      await planning.getByRole("list", { name: "Alle frei:" }).getByRole("button").first().click();
      await expect(planning.getByText("Alle sind zu dieser Zeit frei.")).toBeVisible();
      await expect(dialog.getByLabel("Beginn Uhrzeit")).not.toHaveValue("10:00");
    } finally {
      await remove();
    }
  });

  test("ein Termin auf „Frei“ zählt nicht als belegt", async ({ page, browser }) => {
    const day = wednesday();
    const anna = await signedIn(browser, "anna");
    await anna.goto(`/calendar?date=${day}&event=new&start=${day}T14:00`);
    const annas = anna.getByRole("dialog");
    await annas.getByLabel("Titel").fill(unique("Fortbildung online"));
    await annas.getByLabel("Anzeigen als").selectOption("free");
    await annas.getByRole("button", { name: "Speichern" }).click();
    await expect(annas).toBeHidden();

    const dialog = await newMeetingWithAnna(page, day);
    await dialog.getByLabel("Beginn Uhrzeit").fill("14:00");
    await dialog.getByLabel("Ende Uhrzeit").fill("15:00");
    await expect(dialog.getByText("Alle sind zu dieser Zeit frei.")).toBeVisible();
  });

  test("Max zeigt seine Verfügbarkeit niemandem mehr, dann wieder allen", async ({
    page,
    browser,
  }) => {
    const day = wednesday();
    const remove = await busyAt("max", day, "10:00", "PT1H");
    const max = await signedIn(browser, "max");
    const share = async (from: string, to: "none" | "availability") => {
      await max.goto("/calendar");
      await max.getByRole("button", { name: "Kalender verwalten" }).first().click();
      const manage = max.getByRole("dialog", { name: "Kalender verwalten" });
      await manage
        .getByRole("button", { name: /^Teilen: / })
        .first()
        .click();
      const dialog = max.getByRole("dialog", { name: /teilen$/ });
      await expect(dialog.getByLabel("Alle Kollegen")).toHaveValue(from);
      await dialog.getByLabel("Alle Kollegen").selectOption(to);
      await dialog.getByRole("button", { name: "Speichern" }).click();
      await expect(max.getByRole("status")).toHaveText("Freigabe gespeichert.");
    };
    const maxAtTen = async () => {
      await page.goto(`/calendar?date=${day}&event=new&start=${day}T10:00`);
      const dialog = page.getByRole("dialog");
      await addAttendees(dialog, "max@weber-haustechnik.test");
      return dialog.getByRole("region", { name: "Verfügbarkeit" });
    };
    try {
      await login(page);
      await share("availability", "none");
      await expect((await maxAtTen()).getByText("Alle sind zu dieser Zeit frei.")).toBeVisible();
      await share("none", "availability");
      await expect((await maxAtTen()).getByText("Max ist zu dieser Zeit belegt.")).toBeVisible();
    } finally {
      await remove();
    }
  });
});

/** Picks Anna from the suggestions by her first name, without knowing her address. */
const pickAnna = async (page: Page, day: string) => {
  await login(page);
  await page.goto(`/calendar?date=${day}&event=new&start=${day}T10:00`);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Teilnehmer" }).fill("ann");
  await dialog.getByRole("option", { name: /Anna Weber/ }).click();
  await expect(dialog.getByRole("button", { name: `${address("anna")} entfernen` })).toBeVisible();
  return dialog;
};

test.describe("Kollegen einladen", () => {
  test("schlägt Anna beim Tippen vor und zeigt gleich, wann sie belegt ist", async ({ page }) => {
    const day = wednesday();
    const remove = await busyAt("anna", day, "09:30", "PT2H");
    try {
      const dialog = await pickAnna(page, day);
      const planning = dialog.getByRole("region", { name: "Verfügbarkeit" });
      await expect(planning.getByText("Anna ist zu dieser Zeit belegt.")).toBeVisible();
    } finally {
      await remove();
    }
  });

  test("schlägt Anna am Handy vor @phone", async ({ page }) => {
    const day = wednesday();
    const remove = await busyAt("anna", day, "09:30", "PT2H");
    try {
      const dialog = await pickAnna(page, day);
      await expect(dialog.getByText("Anna ist zu dieser Zeit belegt.")).toBeVisible();
    } finally {
      await remove();
    }
  });
});

test.describe("Verfügbarkeit beim Ändern", () => {
  test("der eigene Termin zählt nicht, auch wenn Anna gleich danach einen hat", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const day = wednesday();
    const remove = await busyAt("anna", day, "09:00", "PT1H");
    try {
      const title = unique("Abstimmung Angebot");
      await login(page);
      await page.goto(`/calendar?date=${day}&event=new&start=${day}T08:00`);
      const dialog = page.getByRole("dialog");
      await dialog.getByLabel("Titel").fill(title);
      await addAttendees(dialog, "anna@weber-haustechnik.test");
      await dialog.getByRole("button", { name: "Speichern" }).click();
      await expect(dialog).toBeHidden();
      await expect.poll(() => titlesOf("anna", day), { timeout: 20_000 }).toContain(title);

      // Anna's copy of it (8–9) touches her own appointment (9–10); other tests plan at 10.
      await page.locator(`[data-day="${day}"]`).getByText(title).click();
      await page.getByRole("dialog").getByRole("button", { name: "Bearbeiten" }).click();
      const planning = page.getByRole("dialog").getByRole("region", { name: "Verfügbarkeit" });
      await expect(planning.getByText("Alle sind zu dieser Zeit frei.")).toBeVisible();
      // An hour later she is busy with her own appointment.
      await page.getByRole("dialog").getByLabel("Beginn Uhrzeit").fill("09:00");
      await page.getByRole("dialog").getByLabel("Ende Uhrzeit").fill("10:00");
      await expect(planning.getByText("Anna ist zu dieser Zeit belegt.")).toBeVisible();
    } finally {
      await remove();
    }
  });
});

test.describe("Verfügbarkeit in der Firma", () => {
  test("eine neue Mitarbeiterin und die Kollegen sehen gegenseitig, wann sie belegt sind", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const local = `lena-${stamp()}`;
    await login(page);
    const password = await newEmployee(page, local, "Lena Neu");
    const lena = createJmapClient({
      origin: STALWART,
      credentials: { username: address(local), password },
    });
    const lenaId = Object.entries((await lena.getSession()).accounts).find(
      ([, a]) => a.name === address(local),
    )![0];
    const annaId = await personalAccountId("anna");
    const shares = async (client: typeof lena, accountId: string) =>
      (
        await client.call<{ list: { shareWith: Record<string, { mayReadFreeBusy?: boolean }> }[] }>(
          "Calendar/get",
          { accountId, properties: ["shareWith"] },
          CALENDARS,
        )
      ).list;
    expect((await shares(lena, lenaId))[0]?.shareWith[annaId]?.mayReadFreeBusy).toBe(true);
    expect((await shares(jmapAs("anna"), annaId))[0]?.shareWith[lenaId]?.mayReadFreeBusy).toBe(
      true,
    );
  });
});

test.describe("Verfügbarkeit am Handy @phone", () => {
  test("übernimmt die nächste freie Zeit aus dem Zeitplan @phone", async ({ page }) => {
    const day = wednesday();
    const remove = await busyAt("anna", day, "09:30", "PT2H");
    try {
      const dialog = await newMeetingWithAnna(page, day);
      await expect(dialog.getByText("Anna ist zu dieser Zeit belegt.")).toBeVisible();
      await dialog.getByRole("button", { name: "Zeitplan" }).click();
      const schedule = page.getByRole("dialog", { name: "Zeitplan" });
      await expect(
        schedule.getByRole("listitem", { name: /^Anna Weber: Belegt bis/ }),
      ).toBeVisible();
      await schedule.getByRole("button", { name: /übernehmen$/ }).click();
      await expect(schedule).toBeHidden();
      await expect(dialog.getByText("Alle sind zu dieser Zeit frei.")).toBeVisible();
    } finally {
      await remove();
    }
  });
});
