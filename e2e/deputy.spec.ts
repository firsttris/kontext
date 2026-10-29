import { expect, test } from "@playwright/test";
import { address, jmapAs, login, personalAccountId, revokeDeputy } from "./helpers";

/**
 * Sandra gives Max her mailbox and calendar to read, then takes it all back. Max and Sandra are
 * used least by tests that look at others' mailboxes; the clean-up runs even when a step fails.
 */
test.describe("Vertretung", () => {
  test("Sandra gibt Max Postfach und Kalender zum Lesen und entzieht alles wieder", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const sandraAccount = async () =>
      Object.entries((await jmapAs("max").getSession()).accounts).find(
        ([, account]) => account.name === address("sandra"),
      )?.[0];
    try {
      await login(page, "sandra");
      await page.goto("/settings?section=deputy");
      await page.getByLabel("Kollegin oder Kollege").selectOption({ label: "Max Becker" });
      await page.getByLabel("Zugriff", { exact: true }).selectOption({ label: "Lesen" });
      await page.getByRole("checkbox", { name: "Kontakte" }).uncheck();
      await page.getByRole("button", { name: "Freigeben" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "Freigegeben für Max Becker." }),
      ).toBeVisible();
      const list = page.getByRole("list", { name: "Wer hat Zugriff" });
      await expect(list.getByRole("listitem").filter({ hasText: "Max Becker" })).toContainText(
        "Postfach: Lesen · Kalender: Lesen",
      );

      // Max sees Sandra's mailbox under "Postfächer" and her calendar's events.
      const max = await (await browser.newContext()).newPage();
      await login(max, "max");
      const mailbox = max.getByRole("link", { name: "sandra@" });
      await expect(mailbox.first()).toBeVisible();
      const accountId = await sandraAccount();
      expect(accountId).toBeDefined();
      const calendars = await jmapAs("max").call<{
        list: { myRights: { mayReadItems: boolean } }[];
      }>("Calendar/get", { accountId });
      expect(calendars.list.every((calendar) => calendar.myRights.mayReadItems)).toBe(true);
      // Contacts were not ticked: Stalwart refuses her address books outright.
      await expect(jmapAs("max").call("AddressBook/get", { accountId })).rejects.toThrow();

      await page.getByRole("button", { name: "Alles entziehen: Max Becker" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "Zugriff für Max Becker entzogen." }),
      ).toBeVisible();
      await expect(list.getByRole("listitem").filter({ hasText: "Max Becker" })).toHaveCount(0);
      await expect.poll(sandraAccount).toBeUndefined();
      await max.reload();
      await expect(max.getByRole("list", { name: "Posteingang" })).toBeVisible();
      await expect(mailbox).toHaveCount(0);
      // Her free and busy times stay, like for every colleague.
      const mine = await jmapAs("sandra").call<{
        list: {
          shareWith: Record<string, { mayReadFreeBusy?: boolean; mayReadItems?: boolean }>;
        }[];
      }>("Calendar/get", { accountId: await personalAccountId("sandra") });
      // In Stalwart a principal's id is also its account id.
      const maxId = await personalAccountId("max");
      expect(mine.list[0]!.shareWith[maxId]).toMatchObject({
        mayReadFreeBusy: true,
        mayReadItems: false,
      });
    } finally {
      await revokeDeputy("sandra", "max");
    }
  });
});
