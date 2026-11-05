import { type Browser, expect, type Page, test } from "@playwright/test";
import { jmapAs, login, personalAccountId, unique } from "./helpers";

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];

const tomorrow = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + 86_400_000),
  );

/** A calendar of Jonas's that Anna may read; its name and id. */
const sharedWithAnna = async () => {
  const name = unique("Termine Jonas");
  const accountId = await personalAccountId("jonas");
  const annaId = await personalAccountId("anna");
  const result = await jmapAs("jonas").call<{ created: Record<string, { id: string }> }>(
    "Calendar/set",
    {
      accountId,
      create: {
        c: { name, shareWith: { [annaId]: { mayReadItems: true, mayReadFreeBusy: true } } },
      },
    },
    USING,
  );
  return { name, accountId, calendarId: result.created.c!.id };
};

/** Anna's view of the events in Jonas's calendar, straight from the server. */
const annaReads = async (accountId: string, calendarId: string) => {
  const { list } = await jmapAs("anna").call<{
    list: { title?: string; privacy?: string; calendarIds: Record<string, boolean> }[];
  }>("CalendarEvent/get", { accountId, properties: ["title", "privacy", "calendarIds"] }, USING);
  return list.filter((event) => event.calendarIds[calendarId]);
};

const privateEvent = async (page: Page, browser: Browser) => {
  test.setTimeout(90_000);
  const { name, accountId, calendarId } = await sharedWithAnna();
  const title = unique("Arzttermin");
  const day = tomorrow();

  // Jonas makes a private appointment in the calendar he shares with Anna.
  await login(page);
  await page.goto(`/calendar?date=${day}&event=new&start=${day}T15:15`);
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Titel").fill(title);
  await dialog.getByLabel("Kalender", { exact: true }).selectOption({ label: name });
  await dialog.getByRole("checkbox", { name: /^Privat/ }).check();
  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toHaveCount(0);

  // He sees its title, and that it is private.
  await page.goto(`/calendar?date=${day}&view=agenda`);
  await page.getByRole("link", { name: new RegExp(title) }).click();
  const own = page.getByRole("dialog", { name: title });
  await expect(own.getByText("Privat", { exact: true })).toBeVisible();
  await expect(own.getByRole("button", { name: "Bearbeiten" })).toBeVisible();

  // Stalwart sends Anna the time, not the title.
  await expect
    .poll(() => annaReads(accountId, calendarId))
    .toEqual([expect.objectContaining({ privacy: "private" })]);
  expect((await annaReads(accountId, calendarId))[0]!.title).toBeFalsy();

  // Anna sees "Privat" with the time, and nothing more.
  // A context of its own keeps the project's device (desktop or phone).
  const anna = await (
    await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" })
  ).newPage();
  await login(anna, "anna");
  await anna.goto(`/calendar?date=${day}&view=agenda`);
  const hidden = anna.getByRole("link").filter({ hasText: "15:15–16:15" }).filter({
    hasText: "Privat",
  });
  await expect(hidden).toBeVisible();
  await expect(anna.getByText(title)).toHaveCount(0);
  await hidden.click();
  const shown = anna.getByRole("dialog", { name: "Privat" });
  await expect(shown).toBeVisible();
  await expect(shown).not.toContainText(title);
  await expect(shown.getByRole("button", { name: "Bearbeiten" })).toHaveCount(0);

  await jmapAs("jonas").call(
    "Calendar/set",
    { accountId, destroy: [calendarId], onDestroyRemoveEvents: true },
    USING,
  );
};

test.describe("Private Termine", () => {
  test("Anna sieht in Jonas' geteiltem Kalender nur „Privat“ und die Zeit", async ({
    page,
    browser,
  }) => {
    await privateEvent(page, browser);
  });
});

test.describe("Private Termine am Handy @phone", () => {
  test("Anna sieht nur „Privat“ und die Zeit @phone", async ({ page, browser }) => {
    await privateEvent(page, browser);
  });
});
