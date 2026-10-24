import { type Browser, expect, type Page, test } from "@playwright/test";
import { login, unique } from "./helpers";

const colleague = async (browser: Browser, user: string) => {
  const page = await (await browser.newContext()).newPage();
  await login(page, user);
  return page;
};

/** A named channel with these members, made by the signed-in person; opens it. */
const newChannel = async (page: Page, members: string[]) => {
  const name = unique("Feinschliff");
  const slug = name.toLowerCase().replace(/ /g, "-");
  await page.getByRole("link", { name: /^Chat/ }).first().click();
  await page.getByRole("button", { name: "Neue Nachricht" }).click();
  const dialog = page.getByRole("dialog", { name: "Neue Nachricht" });
  await dialog.getByRole("tab", { name: "Kanal" }).click();
  await dialog.getByLabel("Name des Kanals").fill(name);
  for (const member of members) await dialog.getByText(member).click();
  await dialog.getByRole("button", { name: "Kanal anlegen" }).click();
  await expect(page.getByRole("heading", { name: `# ${slug}` })).toBeVisible();
  return slug;
};

const openChannel = async (page: Page, slug: string) => {
  await page.getByRole("link", { name: /^Chat/ }).first().click();
  await page
    .getByRole("navigation", { name: "Kanäle" })
    .first()
    .getByRole("link", { name: slug })
    .click();
};

const write = async (page: Page, text: string) => {
  await page.getByRole("textbox", { name: "Nachricht" }).fill(text);
  await page.keyboard.press("Enter");
};

test.describe("Chat: bearbeiten, löschen, suchen, stummschalten", () => {
  test("eigene Nachricht bearbeiten und löschen, die anderen sehen es sofort", async ({
    page,
    browser,
  }) => {
    page.on("dialog", (dialog) => void dialog.accept());
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    const max = await colleague(browser, "max");
    await openChannel(max, slug);

    const typo = unique("Angebt Lang ist raus");
    await write(page, typo);
    const mine = page.getByRole("list", { name: "Nachrichten" });
    await mine.getByRole("button", { name: "Aktionen zur Nachricht" }).click();
    await page.getByRole("menuitem", { name: "Bearbeiten" }).click();
    const field = page.getByRole("textbox", { name: "Bearbeiten" });
    await field.fill(typo.replace("Angebt", "Angebot"));
    await field.press("Enter");
    const theirs = max.getByRole("list", { name: "Nachrichten" });
    await expect(theirs).toContainText(`${typo.replace("Angebt", "Angebot")} (bearbeitet)`);

    // Max may act on it, but not change it.
    await theirs.getByRole("button", { name: "Aktionen zur Nachricht" }).click();
    await expect(max.getByRole("menuitem", { name: "Bearbeiten" })).toHaveCount(0);
    await max.keyboard.press("Escape");

    await mine.getByRole("button", { name: "Aktionen zur Nachricht" }).click();
    await page.getByRole("menuitem", { name: "Löschen" }).click();
    await expect(theirs).toContainText("Nachricht gelöscht");
    await expect(theirs).not.toContainText("Angebot");
  });

  test("sucht in den Kanälen, die man sieht, und springt zur Nachricht", async ({
    page,
    browser,
  }) => {
    const word = unique("Pumpengruppe");
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    await write(page, `Die ${word} kommt am Dienstag`);
    await write(page, "Und noch etwas anderes.");

    const max = await colleague(browser, "max");
    await max.getByRole("link", { name: /^Chat/ }).first().click();
    await max.getByRole("searchbox", { name: "Im Chat suchen" }).first().fill(word);
    const hit = max.getByRole("list", { name: "Treffer im Chat" }).getByRole("link", {
      name: new RegExp(`Jonas · #${slug}`),
    });
    await expect(hit).toContainText(word);
    await hit.click();
    await expect(max).toHaveURL(/message=/);
    await expect(max.getByRole("heading", { name: `# ${slug}` })).toBeVisible();

    const anna = await colleague(browser, "anna");
    await anna.getByRole("link", { name: /^Chat/ }).first().click();
    await anna.getByRole("searchbox", { name: "Im Chat suchen" }).first().fill(word);
    await expect(anna.getByRole("list", { name: "Treffer im Chat" })).toContainText(
      "Nichts gefunden.",
    );
  });

  test("stummgeschaltet zählt nicht, verlassen und löschen", async ({ page, browser }) => {
    page.on("dialog", (dialog) => void dialog.accept());
    await login(page);
    const slug = await newChannel(page, ["Max Becker"]);
    const max = await colleague(browser, "max");
    max.on("dialog", (dialog) => void dialog.accept());
    await openChannel(max, slug);
    await max.getByRole("button", { name: "Mehr zum Kanal" }).click();
    await max.getByRole("menuitem", { name: "Stummschalten" }).click();
    await max.getByRole("link", { name: "allgemein" }).click();

    await openChannel(page, slug);
    await write(page, "Nur zur Info");
    const row = max
      .getByRole("navigation", { name: "Kanäle" })
      .first()
      .getByRole("link", { name: slug });
    await expect(row.getByRole("img", { name: "Stummgeschaltet" })).toBeVisible();
    await expect(row).not.toContainText("1");

    // Max leaves; Jonas, who made it, deletes it.
    await row.click();
    await max.getByRole("button", { name: "Mehr zum Kanal" }).click();
    await max.getByRole("menuitem", { name: "Kanal verlassen" }).click();
    await expect(
      max.getByRole("navigation", { name: "Kanäle" }).first().getByRole("link", { name: slug }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Mehr zum Kanal" }).click();
    await page.getByRole("menuitem", { name: "Kanal löschen" }).click();
    await expect(
      page.getByRole("navigation", { name: "Kanäle" }).first().getByRole("link", { name: slug }),
    ).toHaveCount(0);
  });
});
