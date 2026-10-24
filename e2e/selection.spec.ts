import { expect, type Page, test } from "@playwright/test";
import { addMail, address, jmapAs, login, unique } from "./helpers";

/** Folder role and keywords of each mail with these subjects, in a user's own or shared mailbox. */
const stateOf = async (user: string, mailbox: string, subjects: string[]) => {
  const client = jmapAs(user);
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, a]) => a.name === address(mailbox),
  )![0];
  const [boxes, , got] = await client.request([
    ["Mailbox/get", { accountId, properties: ["role"] }, "m"],
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
        properties: ["subject", "mailboxIds", "keywords"],
      },
      "g",
    ],
  ]);
  const roles = Object.fromEntries(
    (boxes![1].list as { id: string; role: string | null }[]).map((box) => [box.id, box.role]),
  );
  return Object.fromEntries(
    (got![1].list as { subject: string; mailboxIds: object; keywords: object }[]).map((email) => [
      email.subject,
      {
        folder: Object.keys(email.mailboxIds).map((id) => roles[id])[0],
        keywords: Object.keys(email.keywords).sort(),
      },
    ]),
  );
};

const box = (page: Page, subject: string) =>
  page.getByRole("checkbox", { name: `„${subject}“ auswählen` });

test.describe("Mehrere Mails auswählen", () => {
  test("wählt einen Bereich, setzt eine Kategorie und archiviert", async ({ page }) => {
    const subjects = [unique("Auswahl A"), unique("Auswahl B"), unique("Auswahl C")];
    for (const subject of subjects) await addMail("jonas", "jonas", subject);
    await login(page);
    // Newest first: C, B, A. C picked, then Shift on A takes B along.
    await box(page, subjects[2]!).click();
    await box(page, subjects[0]!).click({ modifiers: ["Shift"] });
    await expect(page.getByText("3 ausgewählt")).toBeVisible();

    await page.getByRole("button", { name: "Kategorie", exact: true }).first().click();
    await page.getByRole("menuitemcheckbox", { name: "Erledigt" }).click();
    await page.keyboard.press("Escape");
    await expect
      .poll(async () =>
        Object.values(await stateOf("jonas", "jonas", subjects)).map((s) => s.keywords),
      )
      .toEqual([
        ["$seen", "erledigt"],
        ["$seen", "erledigt"],
        ["$seen", "erledigt"],
      ]);

    await page.getByRole("button", { name: "Archivieren" }).click();
    await expect(page.getByText(/ausgewählt$/)).toHaveCount(0);
    await expect(
      page.getByRole("list", { name: "Posteingang" }).getByText(subjects[1]!),
    ).toHaveCount(0);
    await expect
      .poll(async () =>
        Object.values(await stateOf("jonas", "jonas", subjects)).map((s) => s.folder),
      )
      .toEqual(["archive", "archive", "archive"]);
  });

  test("x nimmt die offene Mail in die Auswahl", async ({ page }) => {
    const subject = unique("Auswahl per Taste");
    await addMail("jonas", "jonas", subject);
    await login(page);
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await page.keyboard.press("x");
    await expect(page.getByText("1 ausgewählt")).toBeVisible();
    await expect(box(page, subject)).toBeChecked();
    await page.getByRole("button", { name: "Auswahl aufheben" }).click();
    await expect(page.getByText("1 ausgewählt")).toHaveCount(0);
  });

  test("über zwei Postfächer in Alle Posteingänge: als ungelesen markieren", async ({ page }) => {
    const own = unique("Eigene Auswahl");
    const shared = unique("Info Auswahl");
    await addMail("jonas", "jonas", own);
    await addMail("jonas", "info", shared);
    await login(page);
    await page.getByRole("link", { name: "Alle Posteingänge" }).click();
    await box(page, own).click();
    await box(page, shared).click();
    await expect(page.getByText("2 ausgewählt")).toBeVisible();
    // Categories and moving belong to one mailbox; for two they are not offered.
    await expect(page.getByRole("button", { name: "Verschieben nach …" })).toHaveCount(0);
    await page.getByRole("button", { name: "Als ungelesen markieren" }).click();
    await expect
      .poll(async () => (await stateOf("jonas", "jonas", [own]))[own]?.keywords)
      .toEqual([]);
    await expect
      .poll(async () => (await stateOf("jonas", "info", [shared]))[shared]?.keywords)
      .toEqual([]);
  });
});

test.describe("Auswählen am Handy @phone", () => {
  test("wählt zwei Mails und löscht sie @phone", async ({ page }) => {
    const subjects = [unique("Handy weg 1"), unique("Handy weg 2")];
    for (const subject of subjects) await addMail("max", "max", subject);
    await login(page, "max");
    await page.getByRole("button", { name: "Auswählen" }).click();
    await expect(page.getByText("0 ausgewählt")).toBeVisible();
    for (const subject of subjects) await box(page, subject).click();
    await page.getByRole("button", { name: "Löschen" }).click();
    await expect
      .poll(async () => Object.values(await stateOf("max", "max", subjects)).map((s) => s.folder))
      .toEqual(["trash", "trash"]);
  });
});
