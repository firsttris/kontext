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

  test("Strg-Klick und die Spalte neben dem Kästchen wählen, ohne die Mail zu öffnen", async ({
    page,
  }) => {
    const subjects = [unique("Spalte A"), unique("Spalte B")];
    for (const subject of subjects) await addMail("jonas", "jonas", subject);
    await login(page);
    const list = page.getByRole("list", { name: "Posteingang" });
    await list.getByText(subjects[1]!).click({ modifiers: ["ControlOrMeta"] });
    await expect(box(page, subjects[1]!)).toBeChecked();
    // Below the box, still in its column: picks too.
    const column = box(page, subjects[0]!).locator("xpath=..");
    const area = (await column.boundingBox())!;
    await page.mouse.click(area.x + area.width / 2, area.y + area.height - 6);
    await expect(box(page, subjects[0]!)).toBeChecked();
    await expect(page.getByText("2 ausgewählt")).toBeVisible();
    await expect(page).not.toHaveURL(/email=/);
    // A plain click still opens the mail, and the picking stays.
    await list.getByText(subjects[0]!).click();
    await expect(page.getByRole("heading", { name: subjects[0]! })).toBeVisible();
    await expect(page.getByText("2 ausgewählt")).toBeVisible();
  });

  test("Shift-Klick in die Spalte neben dem Kästchen wählt einen Bereich", async ({ page }) => {
    const subjects = [
      unique("Spalte Bereich A"),
      unique("Spalte Bereich B"),
      unique("Spalte Bereich C"),
    ];
    for (const subject of subjects) await addMail("jonas", "jonas", subject);
    await login(page);
    await box(page, subjects[2]!).click();
    const area = (await box(page, subjects[0]!).locator("xpath=..").boundingBox())!;
    await page.keyboard.down("Shift");
    await page.mouse.click(area.x + area.width / 2, area.y + area.height - 6);
    await page.keyboard.up("Shift");
    await expect(page.getByText("3 ausgewählt")).toBeVisible();
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

  test("langes Drücken beginnt die Auswahl, ein Tipp wählt dann statt zu öffnen @phone", async ({
    page,
  }) => {
    const subjects = [unique("Handy lang 1"), unique("Handy lang 2")];
    for (const subject of subjects) await addMail("max", "max", subject);
    await login(page, "max");
    const line = page.getByRole("link", { name: new RegExp(subjects[1]!) });
    const at = (await line.boundingBox())!;
    const point = { clientX: at.x + at.width / 2, clientY: at.y + at.height / 2 };
    await line.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, ...point });
    await expect(page.getByText("1 ausgewählt")).toBeVisible();
    await line.dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true, ...point });
    await expect(box(page, subjects[1]!)).toBeChecked();
    // Picking now: a tap on another line picks it and stays in the list.
    await page.getByRole("link", { name: new RegExp(subjects[0]!) }).tap();
    await expect(page.getByText("2 ausgewählt")).toBeVisible();
    await expect(page).not.toHaveURL(/email=/);
  });

  /** Real fingers on the screen, as the browser gets them (pointer events follow from these). */
  const touch = async (page: Page) => {
    const cdp = await page.context().newCDPSession(page);
    return (
      type: "touchStart" | "touchEnd" | "touchCancel",
      touchPoints: { x: number; y: number; id?: number }[],
    ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
  };

  test("ein echter langer Finger-Druck wählt und öffnet nicht @phone", async ({ page }) => {
    const subject = unique("Handy halten");
    await addMail("max", "max", subject);
    await login(page, "max");
    const at = (await page.getByRole("link", { name: new RegExp(subject) }).boundingBox())!;
    const finger = await touch(page);
    await finger("touchStart", [{ x: at.x + at.width / 2, y: at.y + at.height / 2 }]);
    await page.waitForTimeout(800);
    await finger("touchEnd", []);
    await expect(page.getByText("1 ausgewählt")).toBeVisible();
    await page.waitForTimeout(500);
    await expect(page).not.toHaveURL(/email=/);
    await expect(box(page, subject)).toBeChecked();
  });

  test("zwei Finger auf einer Zeile (Zoomen) wählen nichts @phone", async ({ page }) => {
    const subject = unique("Handy zoomen");
    await addMail("max", "max", subject);
    await login(page, "max");
    const at = (await page.getByRole("link", { name: new RegExp(subject) }).boundingBox())!;
    const y = at.y + at.height / 2;
    const one = { x: at.x + 40, y, id: 1 };
    const two = { x: at.x + 160, y, id: 2 };
    const finger = await touch(page);
    await finger("touchStart", [one]);
    await finger("touchStart", [one, two]);
    await page.waitForTimeout(100);
    await finger("touchCancel", []);
    await page.waitForTimeout(900);
    await expect(page.getByText(/\d+ ausgewählt/)).toHaveCount(0);
  });
});

test.describe("Wischen am Handy @phone", () => {
  /** A finger drawn sideways across a line, in steps as the browser gets them. */
  const swipe = async (page: Page, subject: string, by: number) => {
    const at = (await page.getByRole("link", { name: new RegExp(subject) }).boundingBox())!;
    const y = at.y + at.height / 2;
    const x = at.x + at.width / 2;
    const cdp = await page.context().newCDPSession(page);
    const send = (
      type: "touchStart" | "touchMove" | "touchEnd",
      touchPoints: { x: number; y: number }[],
    ) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
    await send("touchStart", [{ x, y }]);
    for (let step = 1; step <= 10; step++)
      await send("touchMove", [{ x: x + (by * step) / 10, y }]);
    await send("touchEnd", []);
    await cdp.detach();
  };

  test("nach links archiviert, nach rechts ungelesen, ohne die Mail zu öffnen @phone", async ({
    page,
  }) => {
    const subjects = [unique("Wisch weg"), unique("Wisch ungelesen"), unique("Wisch kurz")];
    for (const subject of subjects) await addMail("max", "max", subject);
    await login(page, "max");
    await expect(page.getByText(subjects[0]!)).toBeVisible();

    await swipe(page, subjects[0]!, -250);
    await expect(page.getByText(subjects[0]!)).toHaveCount(0);
    await swipe(page, subjects[1]!, 250);
    // Not far enough: nothing happens, and the line does not open either.
    await swipe(page, subjects[2]!, -60);
    await expect
      .poll(async () => stateOf("max", "max", subjects))
      .toMatchObject({
        [subjects[0]!]: { folder: "archive" },
        // addMail puts them in as read: right toggles to unread.
        [subjects[1]!]: { folder: "inbox", keywords: [] },
        [subjects[2]!]: { folder: "inbox", keywords: ["$seen"] },
      });
    await expect(page).not.toHaveURL(/email=/);
  });

  test("was Wischen tut, stellt man je Gerät ein @phone", async ({ page }) => {
    const subject = unique("Wisch Papierkorb");
    await addMail("max", "max", subject);
    await login(page, "max");
    await page.goto("/settings?section=appearance");
    await page.getByLabel("Nach links wischen").selectOption({ label: "Löschen" });
    await page.getByLabel("Nach rechts wischen").selectOption({ label: "Nichts" });
    await page.goto("/");
    await expect(page.getByText(subject)).toBeVisible();

    // Right does nothing now; left deletes.
    await swipe(page, subject, 250);
    await page.waitForTimeout(300);
    await expect(page.getByText(subject)).toBeVisible();
    await swipe(page, subject, -250);
    await expect
      .poll(async () => (await stateOf("max", "max", [subject]))[subject]?.folder)
      .toBe("trash");
  });
});
