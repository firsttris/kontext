import { expect, test } from "@playwright/test";
import { address, jmapAs, login, personalAccountId, unique } from "./helpers";

/** Sandra's folders: no other test uses her Spam or Papierkorb. */
const USER = "sandra";

const folders = async () => {
  const client = jmapAs(USER);
  const accountId = await personalAccountId(USER);
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const id = (role: string) => list.find((box) => box.role === role)!.id;
  return { client, accountId, id };
};

/** A mail in those folders of Sandra's, made behind the UI's back. */
const mailIn = async (roles: string[], subject: string) => {
  const { client, accountId, id } = await folders();
  await client.call("Email/set", {
    accountId,
    create: {
      m: {
        mailboxIds: Object.fromEntries(roles.map((role) => [id(role), true])),
        keywords: { $seen: true },
        from: [{ name: "Werbung", email: "angebot@example.test" }],
        to: [{ name: null, email: address(USER) }],
        subject,
        receivedAt: new Date().toISOString(),
        bodyValues: { b: { value: "Nur für diesen Test." } },
        textBody: [{ partId: "b", type: "text/plain" }],
      },
    },
  });
};

/** The roles of the folders each subject is in now; [] for a mail that is gone. */
const whereIs = async (subjects: string[]) => {
  const { client, accountId } = await folders();
  const { list: boxes } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const [, got] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter: { operator: "OR", conditions: subjects.map((subject) => ({ subject })) },
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["subject", "mailboxIds"],
      },
      "g",
    ],
  ]);
  const mails = got![1].list as { subject: string; mailboxIds: Record<string, boolean> }[];
  const roleOf = (boxId: string) => boxes.find((box) => box.id === boxId)?.role ?? "";
  return subjects.map((subject) =>
    Object.keys(mails.find((mail) => mail.subject === subject)?.mailboxIds ?? {})
      .map(roleOf)
      .sort(),
  );
};

test.describe("Spam und Papierkorb leeren", () => {
  test("leert den Spam nach Rückfrage; eine Mail, die auch im Posteingang liegt, bleibt dort", async ({
    page,
  }) => {
    const only = unique("Gewinnspiel");
    const both = unique("Rabattaktion");
    await mailIn(["junk"], only);
    await mailIn(["junk", "inbox"], both);
    await login(page, USER);
    await page.getByRole("link", { name: "Spam" }).click();
    await expect(page.getByRole("list", { name: "Spam" }).getByText(only)).toBeVisible();
    await page.getByRole("button", { name: "Spam leeren" }).click();
    const ask = page.getByRole("dialog", { name: "Spam leeren?" });
    await expect(ask).toContainText("Mails werden endgültig gelöscht.");
    await ask.getByRole("button", { name: "Endgültig löschen" }).click();
    await expect(page.getByRole("status")).toHaveText("Spam geleert.");
    await expect.poll(() => whereIs([only, both])).toEqual([[], ["inbox"]]);
    await expect(page.getByRole("button", { name: "Spam leeren" })).toHaveCount(0);
  });

  test("Abbrechen lässt den Papierkorb, wie er ist; Leeren am Handy @phone", async ({ page }) => {
    const subject = unique("Alter Newsletter");
    await mailIn(["trash"], subject);
    await login(page, USER);
    await page.goto(`/mail/${await personalAccountId(USER)}/trash`);
    await page.getByRole("button", { name: "Papierkorb leeren" }).click();
    await page
      .getByRole("dialog", { name: "Papierkorb leeren?" })
      .getByRole("button", { name: "Abbrechen" })
      .click();
    expect(await whereIs([subject])).toEqual([["trash"]]);
    await page.getByRole("button", { name: "Papierkorb leeren" }).click();
    await page
      .getByRole("dialog", { name: "Papierkorb leeren?" })
      .getByRole("button", { name: "Endgültig löschen" })
      .click();
    await expect(page.getByRole("status")).toHaveText("Papierkorb geleert.");
    await expect.poll(() => whereIs([subject])).toEqual([[]]);
  });
});
