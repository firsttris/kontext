import { expect, type Page, test } from "@playwright/test";
import { address, jmapAs, login, personalAccountId, unique } from "./helpers";

const INFO = address("info");

/** Removes every mail of `user` with that subject (sent, received, drafts, replies). */
const removeMails = async (user: string, subject: string) => {
  const client = jmapAs(user);
  const accountId = await personalAccountId(user);
  const { ids } = await client.call<{ ids: string[] }>("Email/query", {
    accountId,
    filter: { subject },
  });
  if (ids.length) await client.call("Email/set", { accountId, destroy: ids });
};

/** Takes the default „Antwort an“ off every identity `user` has, in each of the accounts. */
const clearDefaults = async (user: string) => {
  const client = jmapAs(user);
  const using = ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:submission"];
  for (const accountId of Object.keys((await client.getSession()).accounts)) {
    const { list } = await client.call<{ list: { id: string }[] }>(
      "Identity/get",
      { accountId },
      using,
    );
    const update = Object.fromEntries(list.map((identity) => [identity.id, { replyTo: null }]));
    await client.call("Identity/set", { accountId, update }, using);
  }
};

/** The address chips of a composer field, by its label. */
const chips = (page: Page, label: string) =>
  page.getByRole("combobox", { name: label, exact: true }).locator("xpath=..");

/** A new mail to Max with „Antwort an“ info@, up to (not including) sending. */
const writeToMax = async (page: Page, subject: string) => {
  await page.getByRole("link", { name: "Neue Mail" }).first().click();
  await page.getByRole("combobox", { name: "An", exact: true }).fill(address("max"));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Antwort an" })).toHaveCount(0);
  await page.getByRole("button", { name: "Antwort an" }).click();
  await page.getByRole("combobox", { name: "Antwort an" }).fill(INFO);
  await page.keyboard.press("Enter");
  await page.getByLabel("Betreff").fill(subject);
  await page.getByRole("textbox", { name: "Ihre Nachricht …" }).click();
  await page.keyboard.type("Bitte Rückmeldung an das Büro.");
};

test.describe("Antwort an", () => {
  test("Max antwortet auf eine Mail mit „Antwort an“ an info@", async ({ page, browser }) => {
    const subject = unique("Termin Wartung");
    try {
      await login(page);
      await writeToMax(page, subject);
      await page.getByRole("button", { name: "Senden", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();

      const max = await (await browser.newContext()).newPage();
      await login(max, "max");
      await max.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
      await expect(max.getByRole("heading", { name: subject })).toBeVisible();
      await max.getByRole("link", { name: "Antworten", exact: true }).click();
      await expect(chips(max, "An").getByTitle(INFO)).toBeVisible();
      await expect(chips(max, "An").getByTitle(address("jonas"))).toHaveCount(0);
      await max.context().close();
    } finally {
      await removeMails("jonas", subject);
      await removeMails("max", subject);
    }
  });

  test("bleibt im Entwurf erhalten", async ({ page }) => {
    const subject = unique("Angebot Heizung");
    try {
      await login(page);
      await writeToMax(page, subject);
      await expect(page.getByText(/Entwurf gespeichert um/)).toBeVisible({ timeout: 10_000 });
      await page.getByRole("button", { name: "Schließen" }).click();

      await page.getByRole("link", { name: /Entwürfe/ }).click();
      await page.getByRole("list", { name: "Entwürfe" }).getByText(subject).click();
      await expect(page.getByRole("textbox", { name: "Betreff" })).toHaveValue(subject);
      await expect(chips(page, "Antwort an").getByTitle(INFO)).toBeVisible();
    } finally {
      await removeMails("jonas", subject);
    }
  });

  test("übernimmt die Vorgabe aus den Einstellungen", async ({ page }) => {
    const client = jmapAs("sandra");
    const accountId = await personalAccountId("sandra");
    try {
      await login(page, "sandra");
      await page.goto("/settings?section=signature");
      await page.getByLabel("Antwort an", { exact: true }).first().fill(INFO);
      await page.getByRole("button", { name: "Speichern" }).first().click();
      await expect(page.getByRole("status").filter({ hasText: "Gespeichert." })).toBeVisible();

      await page
        .getByRole("link", { name: /^Mail($|, )/ })
        .first()
        .click();
      await page.getByRole("link", { name: "Neue Mail" }).first().click();
      await expect(chips(page, "Antwort an").getByTitle(INFO)).toBeVisible();
    } finally {
      const { list } = await client.call<{ list: { id: string; email: string }[] }>(
        "Identity/get",
        { accountId },
        ["urn:ietf:params:jmap:core", "urn:ietf:params:jmap:submission"],
      );
      const update = Object.fromEntries(list.map((identity) => [identity.id, { replyTo: null }]));
      await client.call("Identity/set", { accountId, update }, [
        "urn:ietf:params:jmap:core",
        "urn:ietf:params:jmap:submission",
      ]);
    }
  });

  test("nimmt im gemeinsamen Postfach die Vorgabe von info@", async ({ page }) => {
    try {
      await login(page);
      await page.goto("/settings?section=signature");
      const card = page.getByRole("region", { name: INFO, exact: true });
      await card.getByLabel("Antwort an", { exact: true }).fill(address("rechnung"));
      await card.getByRole("button", { name: "Speichern" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Gespeichert." })).toBeVisible();

      await page
        .getByRole("link", { name: /^Mail($|, )/ })
        .first()
        .click();
      await page.getByRole("link", { name: "info@" }).click();
      await page.getByRole("link", { name: "Neue Mail" }).first().click();
      await expect(page.getByLabel("Von").locator("option:checked")).toHaveText(/info@/);
      await expect(chips(page, "Antwort an").getByTitle(address("rechnung"))).toBeVisible();
    } finally {
      await clearDefaults("jonas");
    }
  });

  test("lässt sich am Handy einblenden @phone", async ({ page }) => {
    await login(page);
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("button", { name: "Antwort an" }).click();
    const field = page.getByRole("combobox", { name: "Antwort an" });
    await expect(field).toBeInViewport();
    const width = page.viewportSize()?.width ?? 0;
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width,
    );
  });
});
