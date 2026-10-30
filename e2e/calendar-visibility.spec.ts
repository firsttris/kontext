import { type Browser, expect, type Page, test } from "@playwright/test";
import { jmapAs, login, personalAccountId, unique } from "./helpers";

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];

/** A calendar of Jonas's, shared with `reader` to read only; its name. */
const sharedToRead = async (reader: string) => {
  const name = unique("Baustellen");
  const jonas = jmapAs("jonas");
  const accountId = await personalAccountId("jonas");
  const readerId = await personalAccountId(reader);
  const result = await jonas.call<{ created: Record<string, { id: string }> }>(
    "Calendar/set",
    {
      accountId,
      create: {
        c: { name, shareWith: { [readerId]: { mayReadItems: true, mayReadFreeBusy: true } } },
      },
    },
    USING,
  );
  return { name, accountId, calendarId: result.created.c!.id };
};

/** Whether `user` has the calendar shown, as the server keeps it. */
const visibleFor = async (user: string, accountId: string, calendarId: string) => {
  const { list } = await jmapAs(user).call<{ list: { isVisible?: boolean }[] }>(
    "Calendar/get",
    { accountId, ids: [calendarId], properties: ["isVisible"] },
    USING,
  );
  return list[0]?.isVisible !== false;
};

const device = async (browser: Browser, user: string): Promise<Page> => {
  const page = await (
    await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" })
  ).newPage();
  await login(page, user);
  await page.goto("/calendar");
  return page;
};

test.describe("Ausgeblendete Kalender", () => {
  test("gelten auf jedem Gerät, auch für einen Kalender, den man nur lesen darf", async ({
    browser,
  }) => {
    const { name, accountId, calendarId } = await sharedToRead("anna");
    const laptop = await device(browser, "anna");
    await laptop.getByLabel(`${name} anzeigen`).uncheck();
    await expect.poll(() => visibleFor("anna", accountId, calendarId)).toBe(false);

    // Another device: still hidden; for Jonas, whose calendar it is, still shown.
    const phone = await device(browser, "anna");
    await expect(phone.getByLabel(`${name} anzeigen`)).not.toBeChecked();
    expect(await visibleFor("jonas", accountId, calendarId)).toBe(true);

    await phone.getByLabel(`${name} anzeigen`).check();
    await expect.poll(() => visibleFor("anna", accountId, calendarId)).toBe(true);
  });

  test("übernimmt, was ein Gerät früher selbst ausgeblendet hatte", async ({ browser }) => {
    const { name, accountId, calendarId } = await sharedToRead("sandra");
    const context = await browser.newContext({ locale: "de-DE", timezoneId: "Europe/Berlin" });
    await context.addInitScript((key) => {
      if (!sessionStorage.getItem("seeded")) {
        localStorage.setItem("kontext.hiddenCalendars", JSON.stringify([key, "birthdays"]));
        sessionStorage.setItem("seeded", "1");
      }
    }, `${accountId}:${calendarId}`);
    const page = await context.newPage();
    await login(page, "sandra");
    await page.goto("/calendar");
    await expect(page.getByLabel(`${name} anzeigen`)).not.toBeChecked();
    await expect.poll(() => visibleFor("sandra", accountId, calendarId)).toBe(false);
    // Moved: the device keeps only its own rows (birthdays).
    await expect
      .poll(() => page.evaluate(() => localStorage.getItem("kontext.hiddenCalendars")))
      .toBe(JSON.stringify(["birthdays"]));
  });
});
