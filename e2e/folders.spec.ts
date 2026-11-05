import { expect, type Page, test } from "@playwright/test";
import { address, jmapAs, login, mailsWithSubject, personalAccountId, unique } from "./helpers";

/** Max's own folders: made for each test and deleted by it. */
const USER = "max";

type Box = { id: string; name: string; parentId: string | null; role: string | null };

const mailboxes = async () => {
  const accountId = await personalAccountId(USER);
  const { list } = await jmapAs(USER).call<{ list: Box[] }>("Mailbox/get", {
    accountId,
    properties: ["name", "parentId", "role"],
  });
  return list;
};

const byName = async (name: string) => (await mailboxes()).find((box) => box.name === name);

const newFolder = async (name: string) => {
  const accountId = await personalAccountId(USER);
  await jmapAs(USER).call("Mailbox/set", { accountId, create: { f: { name, parentId: null } } });
};

/** An unread mail in the folder, made behind the UI's back. */
const unreadMailIn = async (folderId: string, subject: string) => {
  await jmapAs(USER).call("Email/set", {
    accountId: await personalAccountId(USER),
    create: {
      m: {
        mailboxIds: { [folderId]: true },
        from: [{ name: "Petra Keller", email: "petra@keller-elektro.test" }],
        to: [{ name: null, email: address(USER) }],
        subject,
        receivedAt: new Date().toISOString(),
        bodyValues: { b: { value: "Nur für diesen Test." } },
        textBody: [{ partId: "b", type: "text/plain" }],
      },
    },
  });
};

/** The mail's folders by role (or name) and whether it is read, as Stalwart holds it. */
const mailState = async (subject: string) => {
  const boxes = await mailboxes();
  const [mail] = await mailsWithSubject<{
    mailboxIds: Record<string, true>;
    keywords: Record<string, true>;
  }>(jmapAs(USER), await personalAccountId(USER), [subject], ["mailboxIds", "keywords"]);
  const where = Object.keys(mail?.mailboxIds ?? {}).map((id) => {
    const box = boxes.find((candidate) => candidate.id === id);
    return box?.role ?? box?.name;
  });
  return { where, seen: Boolean(mail?.keywords.$seen) };
};

const folderMenu = (page: Page, name: string) =>
  page.getByRole("button", { name: `Ordnermenü „${name}“` });

/** Rename, move under another folder, mark read, delete: all from the folder's menu. */
const manageFolder = async (page: Page, folder: string, parent: string, subject: string) => {
  const renamed = `${folder} neu`;
  await folderMenu(page, folder).click();
  await page.getByRole("menuitem", { name: "Umbenennen" }).click();
  await page.getByLabel("Name des Ordners").fill(renamed);
  await page.getByRole("dialog").getByRole("button", { name: "Umbenennen" }).click();
  await expect(page.getByRole("link", { name: renamed })).toBeVisible();

  await folderMenu(page, renamed).click();
  await page.getByRole("menuitem", { name: "Verschieben" }).click();
  await page.getByRole("dialog").getByRole("combobox").selectOption({ label: parent });
  await page.getByRole("dialog").getByRole("button", { name: "Verschieben" }).click();
  const parentId = (await byName(parent))!.id;
  await expect.poll(async () => (await byName(renamed))?.parentId).toBe(parentId);
  await expect(page.getByRole("link", { name: renamed })).toBeVisible();

  await folderMenu(page, renamed).click();
  await page.getByRole("menuitem", { name: "Alle als gelesen markieren" }).click();
  await expect.poll(async () => (await mailState(subject)).seen).toBe(true);

  await folderMenu(page, renamed).click();
  await page.getByRole("menuitem", { name: "Löschen" }).click();
  const ask = page.getByRole("dialog", { name: `„${renamed}“ löschen?` });
  await expect(ask).toContainText("1 Mail kommt in den Papierkorb.");
  await ask.getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByRole("status")).toHaveText("Ordner gelöscht.");
  await expect(page.getByRole("link", { name: renamed })).toHaveCount(0);
  await expect.poll(async () => (await mailState(subject)).where).toEqual(["trash"]);
};

const removeFolder = async (name: string) => {
  const box = await byName(name);
  if (!box) return;
  await jmapAs(USER).call("Mailbox/set", {
    accountId: await personalAccountId(USER),
    destroy: [box.id],
    onDestroyRemoveEmails: true,
  });
};

test.describe("Eigene Ordner verwalten", () => {
  test("legt einen Ordner an, benennt ihn um, verschiebt, markiert gelesen und löscht ihn", async ({
    page,
  }) => {
    const folder = unique("Baustelle");
    const parent = unique("Kunden");
    const subject = unique("Aufmaß");
    await newFolder(parent);
    try {
      await login(page, USER);
      await page.getByRole("button", { name: "Ordner anlegen" }).click();
      await page.getByLabel("Name des Ordners").fill(folder);
      await page.getByRole("dialog").getByRole("button", { name: "Ordner anlegen" }).click();
      await expect(page.getByRole("link", { name: folder })).toBeVisible();
      await unreadMailIn((await byName(folder))!.id, subject);
      await manageFolder(page, folder, parent, subject);
    } finally {
      await removeFolder(`${folder} neu`);
      await removeFolder(parent);
    }
  });

  test("dasselbe am Handy, im Ordner-Bildschirm @phone", async ({ page }) => {
    const folder = unique("Baustelle");
    const parent = unique("Kunden");
    const subject = unique("Aufmaß");
    await newFolder(parent);
    await newFolder(folder);
    try {
      await unreadMailIn((await byName(folder))!.id, subject);
      await login(page, USER);
      await page.goto(`/mail/${await personalAccountId(USER)}/inbox?folders=true`);
      await expect(page.getByRole("link", { name: folder })).toBeVisible();
      await manageFolder(page, folder, parent, subject);
    } finally {
      await removeFolder(`${folder} neu`);
      await removeFolder(parent);
    }
  });
});
