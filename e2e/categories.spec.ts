import { expect, type Page, test } from "@playwright/test";
import { addMail, address, givenKeywords, jmapAs, login, unique } from "./helpers";
import { deliverMail } from "./protocols";

/** The keywords of a mail with this subject, in a user's own or shared mailbox. */
const keywordsOf = async (user: string, mailbox: string, subject: string) => {
  const client = jmapAs(user);
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, a]) => a.name === address(mailbox),
  )![0];
  const [, get] = await client.request([
    ["Email/query", { accountId, filter: { subject } }, "q"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["keywords"],
      },
      "g",
    ],
  ]);
  const email = (get![1].list as { keywords: Record<string, boolean> }[])[0];
  return email ? givenKeywords(email.keywords) : null;
};

const openInInfo = async (page: Page, subject: string) => {
  await page.getByRole("link", { name: "info@" }).click();
  await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
  await expect(page.getByRole("heading", { name: subject })).toBeVisible();
};

test.describe("Kategorien", () => {
  test("in info@ für das ganze Team: setzen, sehen, finden", async ({ page, browser }) => {
    const subject = unique("Heizung fällt aus");
    await addMail("jonas", "info", subject);
    await login(page, "jonas");
    await openInInfo(page, subject);

    await page.getByRole("button", { name: "Kategorie", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "In Bearbeitung" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("article")).toContainText("In Bearbeitung");
    await expect(
      page
        .getByRole("list", { name: "Posteingang" })
        .getByRole("link", { name: new RegExp(subject) }),
    ).toContainText("In Bearbeitung");
    await expect
      .poll(() => keywordsOf("jonas", "info", subject))
      .toEqual(["$seen", "in-bearbeitung"]);

    // Anna, also in info@, sees who is on it and finds it through the sidebar.
    const anna = await (await browser.newContext()).newPage();
    await login(anna, "anna");
    await anna.getByRole("link", { name: "info@" }).click();
    await expect(
      anna
        .getByRole("list", { name: "Posteingang" })
        .getByRole("link", { name: new RegExp(subject) }),
    ).toContainText("In Bearbeitung");
    await anna
      .getByRole("navigation", { name: "Kategorien" })
      .getByRole("link", { name: "Mails mit „In Bearbeitung“ zeigen" })
      .click();
    await expect(anna).toHaveURL(/kategorie/);
    await expect(anna.getByRole("heading", { name: "Suche" })).toBeVisible();
    await expect(anna.getByText(subject)).toBeVisible();

    // Done: switched over in the menu.
    await page.getByRole("button", { name: "Kategorie", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "In Bearbeitung" }).click();
    await page.getByRole("menuitemcheckbox", { name: "Erledigt" }).click();
    await page.keyboard.press("Escape");
    await expect.poll(() => keywordsOf("jonas", "info", subject)).toEqual(["$seen", "erledigt"]);
  });

  test("eigene Kategorien anlegen, umbenennen und per Regel setzen", async ({ page }) => {
    await login(page, "sandra");
    await page
      .getByRole("navigation", { name: "Kategorien" })
      .getByRole("button", { name: "Kategorien bearbeiten …" })
      .click();
    const dialog = page.getByRole("dialog", { name: `Kategorien von ${address("sandra")}` });
    await dialog.getByLabel("Neue Kategorie").fill("Angebot");
    await dialog.getByRole("button", { name: "Hinzufügen" }).click();
    await dialog.getByLabel("Name von „Erledigt“").fill("Fertig");
    await dialog.getByRole("button", { name: "Farbe von „Angebot“" }).click();
    await page.getByRole("button", { name: "Violett" }).click();
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Kategorien gespeichert." }),
    ).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Kategorien" });
    await expect(nav).toContainText("Fertig");
    await expect(nav).toContainText("Angebot");

    const token = unique("Anfrage Bad");
    await page.goto("/settings?section=rules");
    await page.getByRole("button", { name: "Neue Regel" }).click();
    const rule = page.getByRole("dialog", { name: "Neue Regel" });
    await rule.getByLabel("Feld").selectOption("subject");
    await rule.getByLabel("Wert").fill(token);
    // Switched on with the first category; Angebot added.
    await rule.getByLabel("Kategorie setzen").check();
    await expect(rule.getByRole("button", { name: "In Bearbeitung" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await rule.getByRole("button", { name: "Angebot" }).click();
    await rule.getByRole("button", { name: "Regel speichern" }).click();
    await expect(page.getByRole("list", { name: "Regeln" })).toContainText("Kategorie „Angebot“");

    await deliverMail({
      from: "kunde@beispiel.example",
      fromName: "Ein Kunde",
      to: address("sandra"),
      subject: token,
      body: "Was kostet ein neues Bad?",
    });
    await expect
      .poll(() => keywordsOf("sandra", "sandra", token), { timeout: 15_000 })
      .toEqual(["angebot", "in-bearbeitung"]);

    await page.getByRole("button", { name: new RegExp(`Bearbeiten: .*${token}`) }).click();
    const edit = page.getByRole("dialog", { name: "Regel bearbeiten" });
    await edit.getByRole("button", { name: "Regel löschen" }).click();
    await edit.getByRole("button", { name: "Wirklich löschen?" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Regel gelöscht." })).toBeVisible();
  });
});

test.describe("Kategorien am Handy @phone", () => {
  test("setzt eine Kategorie an einer Mail @phone", async ({ page }) => {
    const subject = unique("Rückruf erbeten");
    await addMail("max", "max", subject);
    await login(page, "max");
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await page.getByRole("button", { name: "Kategorie", exact: true }).click();
    await page.getByRole("menuitemcheckbox", { name: "Wartet auf Antwort" }).click();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("article")).toContainText("Wartet auf Antwort");
    await expect
      .poll(() => keywordsOf("max", "max", subject))
      .toEqual(["$seen", "wartet-auf-antwort"]);
  });
});
