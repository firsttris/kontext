/**
 * Pictures in the text of a mail that is answered or forwarded: they stay in the quote and go out
 * again as inline parts (cid:, RFC 2392, in multipart/related); a forward keeps the files too.
 */
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  address,
  jmapAs,
  login,
  mailboxWithRole,
  mailsWithSubject,
  personalAccountId,
  removeMails,
  unique,
} from "./helpers";

/** A red 60 × 40 PNG. */
const RED_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAADwAAAAoCAIAAAAt2Q6oAAAAO0lEQVR42u3OQQkAAAgEsEtz/QMZxhQ+hMECLNO+E2lpaWlpaWlpaWlpaWlpaWlpaWlpaWlpaWlp6UsL/qHXl2FUdv0AAAAASUVORK5CYII=";
const CID = "skizze@weber-haustechnik.test";

/** A mail from Anna to Jonas showing a picture by its Content-ID, with a PDF attached. */
const mailWithPicture = async (subject: string) => {
  const client = jmapAs("jonas");
  const accountId = await personalAccountId("jonas");
  const inbox = await mailboxWithRole(client, accountId, "inbox");
  const raw = [
    `From: Anna Weber <${address("anna")}>`,
    `To: ${address("jonas")}`,
    `Subject: ${subject}`,
    `Message-ID: <${crypto.randomUUID()}@weber-haustechnik.test>`,
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=mixed",
    "",
    "--mixed",
    "Content-Type: multipart/related; boundary=related",
    "",
    "--related",
    "Content-Type: text/html; charset=utf-8",
    "",
    `<p>Die Skizze vom Heizraum:</p><p><img src="cid:${CID}" alt="Skizze"></p>`,
    "--related",
    "Content-Type: image/png; name=skizze.png",
    "Content-Disposition: inline; filename=skizze.png",
    `Content-ID: <${CID}>`,
    "Content-Transfer-Encoding: base64",
    "",
    RED_PNG,
    "--related--",
    "--mixed",
    "Content-Type: application/pdf; name=aufmass.pdf",
    "Content-Disposition: attachment; filename=aufmass.pdf",
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from("%PDF-1.4\n%%EOF\n").toString("base64"),
    "--mixed--",
    "",
  ].join("\r\n");
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  await client.call("Email/import", {
    accountId,
    emails: { e: { blobId, mailboxIds: { [inbox]: true }, keywords: { $seen: true } } },
  });
};

type Received = {
  bodyStructure: unknown;
  htmlBody: { partId: string }[];
  attachments: { cid: string | null; disposition: string | null; type: string; name: string }[];
  bodyValues: Record<string, { value: string }>;
};

/** The mail Anna got with this subject, as it lies on her server. */
const receivedByAnna = async (subject: string): Promise<Received | null> => {
  const client = jmapAs("anna");
  const accountId = await personalAccountId("anna");
  const [mail] = await mailsWithSubject<Received>(
    client,
    accountId,
    [subject],
    ["bodyStructure", "htmlBody", "attachments", "bodyValues"],
    { get: { fetchHTMLBodyValues: true } },
  );
  return mail ?? null;
};

/** The picture in the text of what Anna got: inline, shown by its Content-ID. */
const expectInlinePicture = (mail: Received) => {
  const picture = mail.attachments.find((part) => part.type === "image/png");
  expect(picture?.disposition).toBe("inline");
  expect(picture?.cid?.replace(/^<|>$/g, "")).toBe(CID);
  expect(mail.bodyValues[mail.htmlBody[0]!.partId]!.value).toContain(`src="cid:${CID}"`);
  expect(JSON.stringify(mail.bodyStructure)).toContain("multipart/related");
};

/** Opens the mail with this subject and starts an answer or a forward from the buttons below it. */
const startFrom = async (page: Page, subject: string, button: RegExp) => {
  await login(page);
  await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
  await page.getByRole("link", { name: button }).click();
  // The quoted picture by its Content-ID: on phones ProseMirror adds `img.ProseMirror-separator`.
  const picture = page
    .getByRole("textbox", { name: "Ihre Nachricht …" })
    .locator(`img[data-cid="${CID}"]`);
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(60);
};

const send = async (page: Page) => {
  await page.getByRole("button", { name: "Senden", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();
};

/** Anna opens the answer: the picture shows in it. */
const annaSeesPicture = async (browser: Browser, subject: string) => {
  const anna = await (await browser.newContext()).newPage();
  await login(anna, "anna");
  await anna.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
  const picture = anna.frameLocator("iframe[title='Inhalt der Mail']").locator("img");
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(60);
  await anna.context().close();
};

const cleanUp = async (subject: string) => {
  await removeMails("jonas", "jonas", [subject]);
  await removeMails("anna", "anna", [subject]);
};

for (const phone of [false, true]) {
  const where = phone ? " am Handy @phone" : "";

  test(`eine Antwort behält das Bild im Zitat${where}`, async ({ page, browser }) => {
    const subject = unique("Skizze Heizraum");
    try {
      await mailWithPicture(subject);
      await startFrom(page, subject, /^Antworten an/);
      await send(page);
      await expect.poll(() => receivedByAnna(`Re: ${subject}`)).not.toBeNull();
      const mail = (await receivedByAnna(`Re: ${subject}`))!;
      expectInlinePicture(mail);
      // An answer carries no files of the original.
      expect(mail.attachments.map((part) => part.type)).toEqual(["image/png"]);
      await annaSeesPicture(browser, `Re: ${subject}`);
    } finally {
      await cleanUp(subject);
    }
  });

  test(`eine Weiterleitung behält Bild und Anhang${where}`, async ({ page }) => {
    const subject = unique("Aufmaß Heizraum");
    try {
      await mailWithPicture(subject);
      await startFrom(page, subject, /^Weiterleiten$/);
      await expect(
        page.getByRole("form", { name: "Neue Mail" }).getByText("aufmass.pdf"),
      ).toBeVisible();
      await page.getByRole("combobox", { name: "An", exact: true }).fill(address("anna"));
      await page.keyboard.press("Enter");
      await send(page);
      await expect.poll(() => receivedByAnna(`Fwd: ${subject}`)).not.toBeNull();
      const mail = (await receivedByAnna(`Fwd: ${subject}`))!;
      expectInlinePicture(mail);
      const pdf = mail.attachments.find((part) => part.type === "application/pdf");
      expect(pdf?.name).toBe("aufmass.pdf");
      expect(pdf?.disposition).toBe("attachment");
    } finally {
      await cleanUp(subject);
    }
  });
}
