import { expect, type Page, test } from "@playwright/test";
import { address, givenKeywords, jmapAs, login, personalAccountId, unique } from "./helpers";

/** Max's own folders: made for each test and removed with what is in them. */
const USER = "max";

const newFolder = async (name: string) => {
  const accountId = await personalAccountId(USER);
  const result = await jmapAs(USER).call<{ created: Record<string, { id: string }> }>(
    "Mailbox/set",
    { accountId, create: { f: { name, parentId: null } } },
  );
  return { accountId, folderId: result.created.f!.id };
};

const removeFolder = async (accountId: string, folderId: string) => {
  await jmapAs(USER).call("Mailbox/set", {
    accountId,
    destroy: [folderId],
    onDestroyRemoveEmails: true,
  });
};

/** A mail as Thunderbird saves it, sent long ago. */
const eml = (subject: string) => ({
  name: `${subject}.eml`,
  mimeType: "message/rfc822",
  buffer: Buffer.from(
    [
      "From: Petra Keller <petra@keller-elektro.test>",
      `To: ${address(USER)}`,
      `Subject: ${subject}`,
      "Date: Tue, 4 Mar 2025 09:15:00 +0100",
      `Message-ID: <${Date.now().toString(36)}@keller-elektro.test>`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Das Angebot vom Frühjahr, als Datei gesichert.",
      "",
    ].join("\r\n"),
  ),
});

const outlookMsg = {
  name: "Rechnung.msg",
  mimeType: "application/vnd.ms-outlook",
  buffer: Buffer.from([0xd0, 0xcf, 0x11, 0xe0]),
};

/** The imported mail as Stalwart holds it. */
const stored = async (accountId: string, folderId: string) => {
  const [, got] = await jmapAs(USER).request([
    ["Email/query", { accountId, filter: { inMailbox: folderId } }, "q"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["subject", "keywords", "receivedAt"],
      },
      "g",
    ],
  ]);
  return (
    got![1].list as { subject: string; keywords: Record<string, true>; receivedAt: string }[]
  ).map((email) => ({ ...email, keywords: givenKeywords(email.keywords) }));
};

/** Drops files onto an element the way a file manager does. */
const dropFiles = async (page: Page, selector: string, file: ReturnType<typeof eml>) => {
  const transfer = await page.evaluateHandle(
    ({ name, text }) => {
      const data = new DataTransfer();
      data.items.add(new File([text], name, { type: "message/rfc822" }));
      return data;
    },
    { name: file.name, text: file.buffer.toString("utf8") },
  );
  const target = page.locator(selector);
  await target.dispatchEvent("dragover", { dataTransfer: transfer });
  await target.dispatchEvent("drop", { dataTransfer: transfer });
};

test.describe(".eml-Dateien importieren", () => {
  test("Max holt eine .eml in einen eigenen Ordner; eine .msg wird abgelehnt", async ({ page }) => {
    const folder = unique("Altablage");
    const subject = unique("Angebot Frühjahr");
    const { accountId, folderId } = await newFolder(folder);
    try {
      await login(page, USER);
      await page.goto(`/mail/${accountId}/${folderId}`);
      await page
        .locator('input[type="file"][aria-label="E-Mails importieren (.eml)"]')
        .setInputFiles([eml(subject), outlookMsg]);
      await expect(page.getByText("1 Mail importiert.")).toBeVisible();
      await expect(page.getByRole("alert")).toHaveText(
        "Nicht importiert: Rechnung.msg (Outlook-Format .msg wird nicht unterstützt)",
      );
      await expect(page.getByRole("list", { name: folder }).getByText(subject)).toBeVisible();
      expect(await stored(accountId, folderId)).toEqual([
        {
          subject,
          keywords: ["$seen"],
          receivedAt: "2025-03-04T08:15:00Z",
          id: expect.any(String),
        },
      ]);
    } finally {
      await removeFolder(accountId, folderId);
    }
  });

  test("eine auf den Ordner in der Seitenleiste gezogene .eml landet dort", async ({ page }) => {
    const folder = unique("Projekt Müller");
    const subject = unique("Rückfrage Heizung");
    const { accountId, folderId } = await newFolder(folder);
    try {
      await login(page, USER);
      const link = page.getByRole("link", { name: folder });
      await expect(link).toBeVisible();
      await dropFiles(page, `a[href$="/${folderId}"]`, eml(subject));
      await expect(page.getByText("1 Mail importiert.")).toBeVisible();
      await link.click();
      await expect(page.getByRole("list", { name: folder }).getByText(subject)).toBeVisible();
    } finally {
      await removeFolder(accountId, folderId);
    }
  });

  test("am Handy über den Knopf über der Liste @phone", async ({ page }) => {
    const folder = unique("Handy-Ablage");
    const subject = unique("Lieferschein");
    const { accountId, folderId } = await newFolder(folder);
    try {
      await login(page, USER);
      await page.goto(`/mail/${accountId}/${folderId}`);
      const button = page.getByRole("button", { name: "E-Mails importieren (.eml)" });
      await expect(button).toBeVisible();
      const chooser = page.waitForEvent("filechooser");
      await button.click();
      await (await chooser).setFiles(eml(subject));
      await expect(page.getByText("1 Mail importiert.")).toBeVisible();
      await expect(page.getByRole("list", { name: folder }).getByText(subject)).toBeVisible();
    } finally {
      await removeFolder(accountId, folderId);
    }
  });
});
