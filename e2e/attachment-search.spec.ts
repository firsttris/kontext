import { expect, type Page, test } from "@playwright/test";
import { address, jmapAs, login, personalAccountId, unique } from "./helpers";

/** A one-page PDF with one line of text; Stalwart 1.0 indexes its text. */
const pdf = (text: string): string => {
  const content = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(out.length);
    out += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = out.length;
  const rows = offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("");
  return `${out}xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${rows}trailer\n<< /Size ${
    objects.length + 1
  } /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
};

/** A mail in the user's inbox whose word `word` stands only in its attached PDF. */
const mailWithPdf = async (user: string, subject: string, word: string) => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const { list } = await client.call<{ list: { id: string; role: string | null }[] }>(
    "Mailbox/get",
    { accountId, properties: ["role"] },
  );
  const inbox = list.find((box) => box.role === "inbox")!.id;
  const attachment = Buffer.from(pdf(`Angebot ${word} Waermepumpe`))
    .toString("base64")
    .replace(/.{76}/g, "$&\r\n");
  const raw = [
    "From: Erika Kunde <erika@example.test>",
    `To: ${address(user)}`,
    `Subject: ${subject}`,
    `Message-ID: <${crypto.randomUUID()}@example.test>`,
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=b",
    "",
    "--b",
    "Content-Type: text/plain; charset=utf-8",
    "",
    "Anbei die Unterlagen.",
    "--b",
    "Content-Type: application/pdf; name=angebot.pdf",
    "Content-Disposition: attachment; filename=angebot.pdf",
    "Content-Transfer-Encoding: base64",
    "",
    attachment,
    "--b--",
    "",
  ].join("\r\n");
  const { blobId } = await client.upload(accountId, raw, "message/rfc822");
  await client.call("Email/import", {
    accountId,
    emails: { e: { blobId, mailboxIds: { [inbox]: true }, keywords: { $seen: true } } },
  });
};

/** Searches until Stalwart has indexed the mail (it indexes in the background). */
const searchUntilFound = async (page: Page, word: string, subject: string) => {
  const hit = page.getByRole("link", { name: new RegExp(subject) });
  await expect(async () => {
    await page.goto(`/mail/all/search?q=${encodeURIComponent(word)}`);
    await expect(hit).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30_000 });
  return hit;
};

test.describe("Suche in Anhängen", () => {
  test("findet ein Wort, das nur im PDF steht, und sagt es am Treffer", async ({ page }) => {
    const word = `Zebrafink${Date.now() % 100_000}`;
    const subject = unique("Unterlagen Neubau");
    await mailWithPdf("jonas", subject, word);
    await login(page, "jonas");
    const hit = await searchUntilFound(page, word, subject);
    await expect(hit).toContainText("im Anhang");

    // A word in the text is no hit in the attachment.
    const inText = await searchUntilFound(page, "Unterlagen", subject);
    await expect(inText).not.toContainText("im Anhang");
  });
});

test.describe("Suche in Anhängen am Handy @phone", () => {
  test("zeigt den Treffer im PDF @phone", async ({ page }) => {
    const word = `Zaunkoenig${Date.now() % 100_000}`;
    const subject = unique("Angebot Handy");
    await mailWithPdf("max", subject, word);
    await login(page, "max");
    const hit = await searchUntilFound(page, word, subject);
    await expect(hit).toContainText("im Anhang");
  });
});
