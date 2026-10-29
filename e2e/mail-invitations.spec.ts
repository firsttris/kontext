import { expect, type Page, test } from "@playwright/test";
import { address, jmapAs, login, personalAccountId, unique } from "./helpers";
import { deliverInvitation, PETRA } from "./invitation-mail";

const CALENDARS = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:calendars"];

/** The person's events with that UID, with their own answer, read behind the UI's back. */
const storedAnswers = async (user: string, uid: string) => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const { ids } = await client.call<{ ids: string[] }>(
    "CalendarEvent/query",
    { accountId, filter: { uid } },
    CALENDARS,
  );
  if (!ids.length) return [];
  const { list } = await client.call<{
    list: {
      participants: Record<string, { calendarAddress?: string; participationStatus?: string }>;
    }[];
  }>("CalendarEvent/get", { accountId, ids, properties: ["participants"] }, CALENDARS);
  return list.map(
    (event) =>
      Object.values(event.participants).find((p) => p.calendarAddress === `mailto:${address(user)}`)
        ?.participationStatus,
  );
};

/** Subjects of the mails in the person's Sent folder that went to Petra. */
const sentToPetra = async (user: string) => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const sent = list.find((mailbox) => mailbox.role === "sent")!;
  const [, got] = await client.request([
    ["Email/query", { accountId, filter: { inMailbox: sent.id, to: PETRA } }, "q"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["subject"],
      },
      "g",
    ],
  ]);
  return (got![1].list as { subject: string }[]).map((mail) => mail.subject);
};

const open = async (page: Page, subject: string) => {
  await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
};

test.describe("Einladung in der Mail", () => {
  test("Jonas sagt einer Einladung von außen in der Mail zu", async ({ page }) => {
    const title = unique("Abstimmung Elektro");
    const uid = crypto.randomUUID();
    await login(page);
    await deliverInvitation(address("jonas"), { uid, title });
    await open(page, `Einladung: ${title}`);
    const bar = page.getByRole("region", { name: "Einladung" });
    await expect(bar).toContainText("Einladung von Petra Keller");
    await expect(bar).toContainText(title);
    await expect(bar).toContainText("Baustelle Lindenweg");
    await expect(bar).toContainText("Noch nicht beantwortet");

    await bar.getByRole("button", { name: "Zusagen" }).click();
    await expect(page.getByRole("status")).toHaveText("Antwort an Petra Keller verschickt.");
    await expect(bar).toContainText("Du hast zugesagt.");
    await expect(bar.getByRole("button", { name: "Zusagen" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(bar.getByRole("link", { name: "Steht in deinem Kalender" })).toBeVisible();
    expect(await storedAnswers("jonas", uid)).toEqual(["accepted"]);
    await expect.poll(() => sentToPetra("jonas")).toContain(`Angenommen: ${title}`);

    // Changing the mind: the event stays one, with the new answer.
    await bar.getByRole("button", { name: "Absagen" }).click();
    await expect(bar).toContainText("Du hast abgesagt.");
    expect(await storedAnswers("jonas", uid)).toEqual(["declined"]);
    await expect.poll(() => sentToPetra("jonas")).toContain(`Abgelehnt: ${title}`);
  });

  test("eine Absage nimmt den Termin aus dem Kalender", async ({ page }) => {
    const title = unique("Lieferung Verteiler");
    const uid = crypto.randomUUID();
    await login(page);
    await deliverInvitation(address("jonas"), { uid, title });
    await open(page, `Einladung: ${title}`);
    await page
      .getByRole("region", { name: "Einladung" })
      .getByRole("button", { name: "In den Kalender" })
      .click();
    await expect(page.getByRole("status")).toHaveText("Termin in den Kalender übernommen.");
    expect(await storedAnswers("jonas", uid)).toEqual(["needs-action"]);

    await deliverInvitation(address("jonas"), { uid, title, method: "CANCEL", sequence: 1 });
    await open(page, `Abgesagt: ${title}`);
    const bar = page.getByRole("region", { name: "Einladung" });
    await expect(bar).toContainText("Petra Keller hat den Termin abgesagt");
    await bar.getByRole("button", { name: "Aus dem Kalender entfernen" }).click();
    await expect(page.getByRole("status")).toHaveText("Termin aus dem Kalender entfernt.");
    await expect.poll(() => storedAnswers("jonas", uid)).toEqual([]);
  });
});

test.describe("Einladung in der Mail am Handy @phone", () => {
  test("mit Vielleicht antworten", async ({ page }) => {
    const title = unique("Baubesprechung Rohbau");
    const uid = crypto.randomUUID();
    await login(page);
    await deliverInvitation(address("jonas"), { uid, title });
    await page.getByText(`Einladung: ${title}`).click();
    const bar = page.getByRole("region", { name: "Einladung" });
    await expect(bar).toContainText(title);
    await bar.getByRole("button", { name: "Vielleicht" }).click();
    await expect(bar).toContainText("Du hast mit Vielleicht geantwortet.");
    expect(await storedAnswers("jonas", uid)).toEqual(["tentative"]);
  });
});
