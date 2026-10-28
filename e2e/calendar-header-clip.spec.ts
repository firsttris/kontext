import { expect, test } from "@playwright/test";
import { jmapAs, login, personalAccountId, unique } from "./helpers";

const CALENDARS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];

const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());

/** All-day appointments today in Jonas' own calendar, made behind the UI's back; remove themselves. */
const allDayToday = async (count: number) => {
  const client = jmapAs("jonas");
  const accountId = await personalAccountId("jonas");
  const { list } = await client.call<{ list: { id: string; isDefault: boolean }[] }>(
    "Calendar/get",
    { accountId },
    CALENDARS,
  );
  const calendar = list.find((c) => c.isDefault) ?? list[0]!;
  const create = Object.fromEntries(
    Array.from({ length: count }, (_, index) => [
      `e${index}`,
      {
        calendarIds: { [calendar.id]: true },
        title: unique(`Ganztag ${index}`),
        start: `${today()}T00:00:00`,
        showWithoutTime: true,
        duration: "P1D",
      },
    ]),
  );
  const { created } = await client.call<{ created: Record<string, { id: string }> }>(
    "CalendarEvent/set",
    { accountId, create },
    CALENDARS,
  );
  const ids = Object.values(created).map(({ id }) => id);
  return () => client.call("CalendarEvent/set", { accountId, destroy: ids }, CALENDARS);
};

// A landscape phone or a low browser window: wide enough for the desktop layout, not tall.
test.use({ viewport: { width: 900, height: 360 } });

test("Viele ganztägige Termine in einem niedrigen Fenster schneiden die Kopfzeile nicht ab", async ({
  page,
}) => {
  const remove = await allDayToday(14);
  try {
    await login(page);
    await page.getByRole("link", { name: "Kalender" }).first().click();
    const header = page.locator(`[data-day-header="${today()}"]`);
    await expect(header).toBeVisible();
    await expect(page.getByText(/Ganztag 0 /)).toBeVisible();
    const rows = await page.evaluate((day) => {
      const link = document.querySelector(`[data-day-header="${day}"]`)!;
      const headerRow = link.parentElement!;
      return {
        header: { client: headerRow.clientHeight, scroll: headerRow.scrollHeight },
      };
    }, today());
    // Weekday and date in the header keep their full height, however long the all-day row is.
    expect(rows.header.client).toBe(rows.header.scroll);
  } finally {
    await remove();
  }
});
