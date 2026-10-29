import { expect, test } from "@playwright/test";
import { deliverReport } from "./delivery-report";
import { address, jmapAs, login, personalAccountId, unique } from "./helpers";

type Submission = {
  emailId: string;
  envelope: {
    mailFrom: { email: string; parameters: Record<string, string> | null };
    rcptTo: { email: string; parameters: Record<string, string> | null }[];
  };
};

/** Jonas's submission of the mail with this subject, as Stalwart keeps it. */
const submissionOf = async (subject: string): Promise<Submission | undefined> => {
  const client = jmapAs("jonas");
  const accountId = await personalAccountId("jonas");
  const { ids } = await client.call<{ ids: string[] }>("Email/query", {
    accountId,
    filter: { subject },
  });
  if (!ids.length) return undefined;
  const [, got] = await client.request(
    [
      ["EmailSubmission/query", { accountId, filter: { emailIds: ids } }, "q"],
      [
        "EmailSubmission/get",
        { accountId, "#ids": { resultOf: "q", name: "EmailSubmission/query", path: "/ids" } },
        "g",
      ],
    ],
    ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:mail", "urn:ietf:params:jmap:submission"],
  );
  return (got![1] as { list: Submission[] }).list[0];
};

test.describe("Zustellbestätigung", () => {
  test("anfordern, der Server bestätigt, beim Absender sehen", async ({ page }) => {
    const subject = unique("Termin Heizungswartung");
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("max");
    await page.getByRole("option", { name: /Max Becker/ }).click();
    await page.getByLabel("Betreff").fill(subject);
    await page.getByRole("textbox", { name: "Ihre Nachricht …" }).fill("Passt Dienstag?");
    const request = page.getByRole("button", { name: "Zustellbestätigung anfordern" });
    await request.click();
    await expect(request).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");

    // The envelope asks Stalwart for a report (RFC 3461), with an id to find the mail again.
    await expect.poll(() => submissionOf(subject)).toBeTruthy();
    const { envelope } = (await submissionOf(subject))!;
    expect(envelope.mailFrom.email).toBe(address("jonas"));
    expect(envelope.mailFrom.parameters).toMatchObject({ RET: "HDRS" });
    expect(envelope.mailFrom.parameters?.ENVID).toMatch(/^[0-9a-f-]{36}$/);
    expect(envelope.rcptTo).toEqual([
      { email: address("max"), parameters: { NOTIFY: "SUCCESS,FAILURE" } },
    ]);

    // Stalwart delivers locally and reports it; the sent mail shows the report.
    await page.getByRole("link", { name: "Gesendet", exact: true }).click();
    await page.getByRole("list", { name: "Gesendet" }).getByText(subject).click();
    await expect(
      page
        .getByRole("note", { name: "Zustellbericht" })
        .filter({ hasText: "Zugestellt an Max Becker" }),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("ohne Anfrage kein Bericht und keine Zeile", async ({ page }) => {
    const subject = unique("Rückfrage Rechnung");
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("max");
    await page.getByRole("option", { name: /Max Becker/ }).click();
    await page.getByLabel("Betreff").fill(subject);
    await page.getByRole("textbox", { name: "Ihre Nachricht …" }).fill("Kurze Frage.");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(() => submissionOf(subject)).toBeTruthy();
    expect((await submissionOf(subject))!.envelope.rcptTo[0]!.parameters).toBeNull();

    await page.getByRole("link", { name: "Gesendet", exact: true }).click();
    await page.getByRole("list", { name: "Gesendet" }).getByText(subject).click();
    await expect(page.getByRole("heading", { name: subject })).toBeVisible();
    await expect(page.getByRole("note", { name: "Zustellbericht" })).toHaveCount(0);
  });

  test("ein Bericht von außen ist lesbar: wer, zugestellt oder nicht, warum", async ({ page }) => {
    const subject = unique("Angebot Lindenweg");
    await deliverReport("jonas", {
      subject,
      recipients: [
        { address: "petra@keller-elektro.test", action: "delivered" },
        {
          address: "p.keller@keller-elektro.test",
          action: "failed",
          diagnostic: "550 5.1.1 <p.keller@keller-elektro.test>: Recipient address rejected",
        },
      ],
    });
    await login(page);
    await page
      .getByRole("list", { name: "Posteingang" })
      .getByText("Delivery Status Notification")
      .first()
      .click();
    const report = page.getByRole("region", { name: "Zustellbericht" });
    await expect(report).toContainText("Zustellbericht von mx.example.test");
    await expect(report).toContainText("Zugestellt an petra@keller-elektro.test");
    await expect(report).toContainText("Nicht zugestellt an p.keller@keller-elektro.test");
    await expect(report).toContainText("Recipient address rejected");
  });
});
