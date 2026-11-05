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

/**
 * Sandra plans `count` appointments into a new calendar of info@ and moves one of them. Stalwart
 * keeps a notice of each new one for 30 days (`expungeSchedulingInboxAfter`); the bell never
 * shows those, so nobody dismisses them. Destroying the calendar takes its notices with it
 * (`reap_calendar_notifications`, crates/groupware/src/calendar/notification.rs).
 */
const sandraPlansMany = async (count: number, moved: string) => {
  const sandra = jmapAs("sandra");
  const session = await sandra.getSession();
  const infoId = Object.entries(session.accounts).find(([, a]) => a.name.startsWith("info@"))![0];
  const calendar = await sandra.call<{ created: Record<string, { id: string }> }>(
    "Calendar/set",
    { accountId: infoId, create: { c: { name: unique("Einsätze") } } },
    USING,
  );
  const calendarId = calendar.created.c!.id;
  const event = (title: string) => ({
    calendarIds: { [calendarId]: true },
    title,
    start: `${dayFromToday(5)}T08:00:00`,
    timeZone: "Europe/Berlin",
    duration: "PT1H",
  });
  for (let at = 0; at < count; at += 250) {
    const titles = Array.from({ length: Math.min(250, count - at) }, (_, i) => `Einsatz ${at + i}`);
    await sandra.call(
      "CalendarEvent/set",
      { accountId: infoId, create: Object.fromEntries(titles.map((t, i) => [`e${i}`, event(t)])) },
      USING,
    );
  }
  const created = await sandra.call<{ created: Record<string, { id: string }> }>(
    "CalendarEvent/set",
    { accountId: infoId, create: { e: event(moved) } },
    USING,
  );
  await sandra.call(
    "CalendarEvent/set",
    {
      accountId: infoId,
      update: { [created.created.e!.id]: { start: `${dayFromToday(6)}T10:00:00` } },
    },
    USING,
  );
  return () =>
    sandra.call(
      "Calendar/set",
      { accountId: infoId, destroy: [calendarId], onDestroyRemoveEvents: true },
      USING,
    );
};

test.describe("Hinweise von Stalwart in der Glocke", () => {
  test("ein voller Kalender von info@ verdrängt die Änderungen nicht", async ({ page }) => {
    // More notices than one CalendarEventNotification/get without ids answers (maxGetResults,
    // 500 by default: crates/registry/src/schema/structs_impl.rs; all_ids in
    // crates/jmap-proto/src/method/get.rs answers requestTooLarge beyond it).
    const title = unique("Umzug Lager");
    const remove = await sandraPlansMany(501, title);
    try {
      await login(page);
      await bell(page).click();
      await expect(
        page
          .getByRole("dialog", { name: "Benachrichtigungen" })
          .getByRole("link", { name: new RegExp(`Sandra Klein hat „${title}“ verschoben`) }),
      ).toBeVisible();
    } finally {
      await remove();
    }
  });

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
