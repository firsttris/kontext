import { expect, type Page, test } from "@playwright/test";
import { jmapAs, login, personalAccountId, unique } from "./helpers";

const FOOTER = "Weber Haustechnik GmbH · Sitz: Freiburg\nAmtsgericht Freiburg HRB 4711";

/**
 * Pflichtangaben set for this page only: the app's read is answered here (after asking the real
 * server, whose answer must be fine). Set at the server, they would go under the mails of the
 * tests running beside this one.
 */
const footerOn = (page: Page) =>
  page.route("**/api/company/legal-footer", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    expect((await route.fetch()).ok()).toBe(true);
    await route.fulfill({ json: { text: FOOTER } });
  });

/** Text and HTML of the user's mails with that subject (Drafts or not, as `draft` says). */
const bodiesOf = async (user: string, subject: string, draft: boolean) => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const [, get] = await client.request([
    [
      "Email/query",
      {
        accountId,
        filter: draft ? { subject, hasKeyword: "$draft" } : { subject, notKeyword: "$draft" },
      },
      "q",
    ],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["textBody", "htmlBody", "bodyValues"],
        fetchTextBodyValues: true,
        fetchHTMLBodyValues: true,
      },
      "g",
    ],
  ]);
  type Part = { partId: string };
  const list = get![1].list as {
    textBody: Part[];
    htmlBody: Part[];
    bodyValues: Record<string, { value: string }>;
  }[];
  return list.map((email) => ({
    text: email.textBody.map((part) => email.bodyValues[part.partId]?.value ?? "").join(""),
    html: email.htmlBody.map((part) => email.bodyValues[part.partId]?.value ?? "").join(""),
  }));
};

test.describe("Pflichtangaben", () => {
  test("stehen beim Schreiben unter dem Text und gehen mit der Mail, nicht in den Entwurf", async ({
    page,
  }) => {
    await footerOn(page);
    await login(page);
    const subject = unique("Angebot Heizung");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill("max");
    await page.getByRole("option", { name: /Max Becker/ }).click();
    await page.getByLabel("Betreff").fill(subject);
    const editor = page.getByRole("textbox", { name: "Ihre Nachricht …" });
    await editor.fill("Hallo Max, hier das Angebot.");

    const footer = page.getByRole("region", { name: "Pflichtangaben der Firma" });
    await expect(footer).toContainText("Amtsgericht Freiburg HRB 4711");
    await expect(editor).not.toContainText("HRB 4711");

    // The draft written meanwhile has the text, not the footer.
    await expect(page.getByText(/Entwurf gespeichert um/)).toBeVisible();
    await expect.poll(async () => (await bodiesOf("jonas", subject, true)).length).toBe(1);
    const [draft] = await bodiesOf("jonas", subject, true);
    expect(draft!.text).toContain("hier das Angebot");
    expect(draft!.text).not.toContain("HRB 4711");

    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(async () => (await bodiesOf("max", subject, false)).length).toBe(1);
    const [arrived] = await bodiesOf("max", subject, false);
    expect(arrived!.text).toContain(`hier das Angebot.\n\n${FOOTER}`);
    expect(arrived!.html).toContain("data-legal-footer");
    expect(arrived!.html).toContain("Sitz: Freiburg<br>Amtsgericht Freiburg HRB 4711");
  });

  test("setzt die Firmenverwaltung, für alle Mitarbeiter", async ({ page }) => {
    // The save is answered here, so no other test's mail gets the footer; the server's side is
    // in server/company/routes.test.ts.
    const saved: string[] = [];
    await page.route("**/api/company/legal-footer", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      const { text } = route.request().postDataJSON() as { text: string };
      saved.push(text);
      await route.fulfill({ json: { text: text.trim() } });
    });
    await login(page, "jonas");
    await page.goto("/settings?section=company-legal");
    const field = page.getByRole("textbox", { name: "Text unter jeder Mail" });
    await expect(field).toHaveValue("");
    const save = page.getByRole("button", { name: "Speichern" });
    await expect(save).toBeDisabled();
    await field.fill(FOOTER);
    await save.click();
    await expect(page.getByRole("status").filter({ hasText: "Gespeichert" })).toBeVisible();
    expect(saved).toEqual([FOOTER]);
  });

  test("gibt es in der Firmenverwaltung nur für Admins", async ({ page }) => {
    await login(page, "anna");
    expect((await page.request.get("/api/company/legal-footer")).ok()).toBe(true);
    expect(
      (await page.request.put("/api/company/legal-footer", { data: { text: "x" } })).status(),
    ).toBe(403);
  });
});
