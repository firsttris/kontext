import { expect, type Page, test } from "@playwright/test";
import { addMail, address, findMails, jmapAs, login, personalAccountId, unique } from "./helpers";

const NAMESPACE = "kontext.firsttris.github.io";

/** The account and inbox of a shared mailbox, as `user` sees them. */
const sharedInbox = async (user: string, mailbox: string) => {
  const client = jmapAs(user);
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, a]) => a.name === address(mailbox),
  )![0];
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  return { accountId, inboxId: list.find((box) => box.role === "inbox")!.id };
};

/** Kontext's metadata on the mail with this subject, as stored in Stalwart. */
const assignmentOn = async (user: string, mailbox: string, subject: string) => {
  const { accountId } = await sharedInbox(user, mailbox);
  const [, got] = await jmapAs(user).request(
    [
      ["Email/query", { accountId, filter: { subject } }, "q"],
      [
        "Email/get",
        {
          accountId,
          "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
          properties: [`metadata/${NAMESPACE}`],
        },
        "g",
      ],
    ],
    ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:metadata"],
  );
  const email = (got![1].list as { metadata?: Record<string, unknown> }[])[0];
  return email?.metadata?.[NAMESPACE] ?? null;
};

const inbox = (page: Page) => page.getByRole("list", { name: "Posteingang" });
const filters = (page: Page) => page.getByRole("navigation", { name: "Filter" });

test.describe("Mails zuweisen", () => {
  test("in info@ an Anna zuweisen; sie findet sie unter „Mir zugewiesen“ und erledigt sie", async ({
    page,
    browser,
  }) => {
    const subject = unique("Heizung tropft");
    await addMail("jonas", "info", subject);
    await login(page, "jonas");
    await page.getByRole("link", { name: "info@" }).click();
    await inbox(page).getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();

    await page.getByRole("button", { name: "Zuweisen", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Anna Weber" }).click();
    await expect(page.getByRole("article")).toContainText("Zugewiesen an Anna Weber");
    await expect(inbox(page).getByRole("link", { name: new RegExp(subject) })).toContainText(
      "Anna",
    );
    const anna = await personalAccountId("anna");
    await expect.poll(() => assignmentOn("jonas", "info", subject)).toEqual({ assignee: anna });

    // Anna sees it among her open mails, marks it done; then it is in neither filter.
    const annaPage = await (await browser.newContext()).newPage();
    await login(annaPage, "anna");
    await annaPage.getByRole("link", { name: "info@" }).click();
    await filters(annaPage).getByRole("link", { name: "Mir zugewiesen" }).click();
    await expect(inbox(annaPage).getByText(subject)).toBeVisible();
    await inbox(annaPage).getByText(subject).click();
    await annaPage.getByRole("button", { name: "Zuweisen", exact: true }).click();
    await annaPage.getByRole("menuitemcheckbox", { name: "Erledigt" }).click();
    await annaPage.keyboard.press("Escape");
    await expect(annaPage.getByRole("article")).toContainText("Erledigt · Anna Weber");
    await expect
      .poll(() => assignmentOn("anna", "info", subject))
      .toEqual({ assignee: anna, state: "done" });
    await expect(inbox(annaPage).getByText(subject)).toBeHidden();
    await filters(annaPage).getByRole("link", { name: "Offen" }).click();
    await expect(inbox(annaPage).getByText(subject)).toBeHidden();
    await filters(annaPage).getByRole("link", { name: "Alle" }).click();
    await expect(inbox(annaPage).getByRole("link", { name: new RegExp(subject) })).toContainText(
      "Erledigt",
    );

    // Given to nobody again, the mail is open and unassigned.
    await page.reload();
    await page.getByRole("button", { name: "Zuweisen", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Erledigt" }).click();
    await page.getByRole("menuitemradio", { name: "Niemandem" }).click();
    await expect.poll(() => assignmentOn("jonas", "info", subject)).toBeNull();
    await expect(page.getByRole("article")).not.toContainText("Zugewiesen");
  });

  test("„Mir zugewiesen“ zeigt keine wieder vorgelegte Mail, die niemandem gehört", async ({
    page,
  }) => {
    // Wiedervorlage in info@: the mail is back in the inbox, unread, with Kontext's keyword.
    const subject = unique("Wieder vorgelegt, niemandem");
    await addMail("jonas", "info", subject);
    const { accountId } = await sharedInbox("jonas", "info");
    const id = (await findMails("jonas", "info", [subject]))[0]!.id;
    await jmapAs("jonas").call("Email/set", {
      accountId,
      update: { [id]: { "keywords/$seen": null, "keywords/kontext.resurfaced": true } },
    });
    await login(page, "jonas");
    await page.getByRole("link", { name: "info@" }).click();
    await expect(inbox(page).getByText(subject)).toBeVisible();
    await filters(page).getByRole("link", { name: "Mir zugewiesen" }).click();
    await expect(page).toHaveURL(/assigned=mine/);
    await expect(inbox(page).getByText(subject)).toBeHidden();
  });

  test("bietet nur die Mitglieder des Postfachs an", async ({ page }) => {
    // rechnung@: Jonas and Anna; Sandra is only in info@, Max in neither.
    const subject = unique("Rechnung offen");
    await addMail("jonas", "rechnung", subject);
    await login(page, "jonas");
    await page.getByRole("link", { name: "rechnung@" }).click();
    await inbox(page).getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await page.getByRole("button", { name: "Zuweisen", exact: true }).click();
    await expect(page.getByRole("menuitemradio", { name: "Anna Weber" })).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "Mir zuweisen" })).toBeVisible();
    await expect(page.getByRole("menuitemradio", { name: "Sandra Klein" })).toHaveCount(0);
    await expect(page.getByRole("menuitemradio", { name: "Max Becker" })).toHaveCount(0);
  });

  test("wer ein gemeinsames Postfach nur liest, bekommt kein „Zuweisen“", async ({ page }) => {
    // rechnung@ shared with Max "Nur lesen" (server/company/sharing.ts READ_ONLY): Stalwart gives
    // maySetKeywords but not maySetMetadata, and refuses the assignment ("forbidden").
    const subject = unique("Nur gelesen");
    await addMail("jonas", "rechnung", subject);
    const { accountId, inboxId } = await sharedInbox("jonas", "rechnung");
    const max = await personalAccountId("max");
    const share = (rights: Record<string, boolean> | null) =>
      jmapAs("jonas").call("Mailbox/set", {
        accountId,
        update: { [inboxId]: { [`shareWith/${max}`]: rights } },
      });
    await share({ mayReadItems: true, maySetSeen: true });
    try {
      await login(page, "max");
      await page.goto(`/mail/${accountId}/${inboxId}`);
      await inbox(page).getByText(subject).click();
      await expect(page.getByRole("heading", { name: subject })).toBeVisible();
      await expect(page.getByRole("button", { name: "Zuweisen", exact: true })).toHaveCount(0);
    } finally {
      await share(null);
    }
  });

  test("im eigenen Postfach gibt es nichts zuzuweisen", async ({ page }) => {
    const subject = unique("Nur für mich");
    await addMail("jonas", "jonas", subject);
    await login(page, "jonas");
    await inbox(page).getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByRole("button", { name: "Zuweisen", exact: true })).toHaveCount(0);
    await expect(filters(page).getByRole("link", { name: "Mir zugewiesen" })).toHaveCount(0);
  });
});

test.describe("Mails zuweisen am Handy @phone", () => {
  test("nimmt eine Mail aus info@ und findet sie unter „Mir zugewiesen“ @phone", async ({
    page,
  }) => {
    const subject = unique("Rückruf Wartung");
    await addMail("sandra", "info", subject);
    const { accountId, inboxId } = await sharedInbox("sandra", "info");
    await login(page, "sandra");
    await page.goto(`/mail/${accountId}/${inboxId}`);
    await inbox(page).getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await page.getByRole("button", { name: "Zuweisen", exact: true }).click();
    await page.getByRole("menuitemradio", { name: "Mir zuweisen" }).click();
    await expect(page.getByRole("article")).toContainText("Zugewiesen an Sandra Klein");
    await page.getByRole("button", { name: "Zurück" }).click();
    await filters(page).getByRole("link", { name: "Mir zugewiesen" }).click();
    await expect(inbox(page).getByText(subject)).toBeVisible();
    const width = page.viewportSize()?.width ?? 0;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
});
