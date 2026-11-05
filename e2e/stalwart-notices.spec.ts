import { expect, type Page, test } from "@playwright/test";
import { dayFromToday, jmapAs, login, personalAccountId, unique } from "./helpers";

const USING = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];
const PRINCIPALS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:principals"];

const bell = (page: Page) =>
  page
    .getByRole("navigation", { name: "Apps" })
    .getByRole("button", { name: /Benachrichtigungen/ });

/** Anna shares a new calendar with Jonas to read; its name and how to remove it. */
const annaShares = async () => {
  const name = unique("Baustellen");
  const anna = jmapAs("anna");
  const accountId = await personalAccountId("anna");
  const jonasId = await personalAccountId("jonas");
  const result = await anna.call<{ created: Record<string, { id: string }> }>(
    "Calendar/set",
    {
      accountId,
      create: {
        c: { name, shareWith: { [jonasId]: { mayReadItems: true, mayReadFreeBusy: true } } },
      },
    },
    USING,
  );
  const id = result.created.c!.id;
  return {
    name,
    remove: () => anna.call("Calendar/set", { accountId, destroy: [id] }, USING),
  };
};

/** Sandra enters an appointment into info@'s calendar and moves it a day on. */
const sandraMoves = async (title: string) => {
  const sandra = jmapAs("sandra");
  const session = await sandra.getSession();
  const infoId = Object.entries(session.accounts).find(([, a]) => a.name.startsWith("info@"))![0];
  const { list } = await sandra.call<{ list: { id: string }[] }>(
    "Calendar/get",
    { accountId: infoId },
    USING,
  );
  const event = {
    calendarIds: { [list[0]!.id]: true },
    title,
    start: `${dayFromToday(3)}T09:00:00`,
    timeZone: "Europe/Berlin",
    duration: "PT1H",
  };
  const created = await sandra.call<{ created: Record<string, { id: string }> }>(
    "CalendarEvent/set",
    { accountId: infoId, create: { e: event } },
    USING,
  );
  const id = created.created.e!.id;
  await sandra.call(
    "CalendarEvent/set",
    { accountId: infoId, update: { [id]: { start: `${dayFromToday(4)}T10:00:00` } } },
    USING,
  );
  return () => sandra.call("CalendarEvent/set", { accountId: infoId, destroy: [id] }, USING);
};

const jonasShares = async () => {
  const jonasId = await personalAccountId("jonas");
  const { list } = await jmapAs("jonas").call<{ list: { id: string }[] }>(
    "ShareNotification/get",
    { accountId: jonasId, ids: null },
    PRINCIPALS,
  );
  return list.map((notice) => notice.id);
};

test.describe("Hinweise von Stalwart in der Glocke", () => {
  test("Freigabe und verschobener Termin erscheinen live und verschwinden beim Öffnen", async ({
    page,
  }) => {
    await login(page);
    const before = await jonasShares();
    const share = await annaShares();
    const title = unique("Wartung Heizung");
    const removeEvent = await sandraMoves(title);
    try {
      // Without a reload: push brings both.
      await expect(bell(page)).toHaveAccessibleName(/Benachrichtigungen, \d+ neu/);
      await bell(page).click();
      const changes = page
        .getByRole("dialog", { name: "Benachrichtigungen" })
        .getByRole("region", { name: "Freigaben und Änderungen" });
      // The newest first, as Stalwart gives them. Without the calendar's name: Stalwart pushes
      // changes of the own account and its groups only (crates/common/src/storage/state.rs), so
      // Anna's new calendar may not be loaded here yet.
      const shares = changes.getByRole("link", {
        name: /Anna Weber hat dir einen Kalender freigegeben/,
      });
      const shared = shares.first();
      await expect(shared).toBeVisible();
      const count = await shares.count();
      await expect(
        changes.getByRole("link", { name: new RegExp(`Sandra Klein hat „${title}“ verschoben`) }),
      ).toBeVisible();

      await shared.click();
      await expect(page).toHaveURL(/\/calendar/);
      // Dismissed on the server, not only on this page.
      await expect
        .poll(async () => (await jonasShares()).filter((id) => !before.includes(id)).length)
        .toBe(0);
      await bell(page).click();
      await expect(shares).toHaveCount(count - 1);
    } finally {
      await removeEvent();
      await share.remove();
    }
  });
});
