import { expect, type Page, test } from "@playwright/test";
import {
  addMail,
  address,
  givenKeywords,
  inboxMails,
  jmapAs,
  login,
  removeMails,
  unique,
} from "./helpers";
import { deliverMail } from "./protocols";

/**
 * Where a mail with this subject is, by folder role or name, and its keywords; in the user's own
 * mailbox or in a shared one they belong to.
 */
const findMail = async (user: string, subject: string, mailbox = user) => {
  const client = jmapAs(user);
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, account]) => account.name === address(mailbox),
  )![0];
  const [boxes, , get] = await client.request([
    ["Mailbox/get", { accountId, properties: ["name", "role"] }, "m"],
    ["Email/query", { accountId, filter: { subject } }, "q"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["mailboxIds", "keywords"],
      },
      "g",
    ],
  ]);
  const mailboxes = boxes![1].list as { id: string; name: string; role: string | null }[];
  const email = (get![1].list as { mailboxIds: object; keywords: object }[])[0];
  if (!email) return null;
  const box = mailboxes.find((candidate) => Object.keys(email.mailboxIds).includes(candidate.id));
  return { folder: box?.role ?? box?.name, keywords: givenKeywords(email.keywords) };
};

const deleteRule = async (page: Page, title: RegExp) => {
  await page.getByRole("button", { name: title }).click();
  const dialog = page.getByRole("dialog", { name: "Regel bearbeiten" });
  await dialog.getByRole("button", { name: "Regel löschen" }).click();
  await dialog.getByRole("button", { name: "Wirklich löschen?" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Regel gelöscht." })).toBeVisible();
};

test.describe("Regeln", () => {
  test("sortiert eine neue Mail nach einer Regel ins Archiv, gelesen", async ({ page }) => {
    const token = unique("Lieferschein");
    await login(page, "anna");
    await page.goto("/settings?section=rules");
    await expect(page.getByText("Noch keine Regeln.")).toBeVisible();
    await page.getByRole("button", { name: "Neue Regel" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Regel" });
    await dialog.getByLabel("Feld").selectOption("subject");
    await dialog.getByLabel("Wert").fill(token);
    await dialog.getByRole("button", { name: "Regel speichern" }).click();
    await expect(dialog.getByRole("alert")).toHaveText(
      "Bitte wählen Sie, was mit der Mail passieren soll.",
    );
    await dialog.getByLabel("In Ordner verschieben").check();
    await dialog.getByLabel("Ordner wählen").selectOption({ label: "Archiv" });
    await dialog.getByLabel("Als gelesen markieren").check();
    await dialog.getByRole("button", { name: "Regel speichern" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Regel gespeichert." })).toBeVisible();
    await expect(page.getByRole("list", { name: "Regeln" }).getByRole("listitem")).toContainText(
      `Betreff enthält „${token}“nach „Archiv“ verschieben · als gelesen markieren`,
    );

    await deliverMail({
      from: "lager@grosshandel.example",
      fromName: "Großhandel Lager",
      to: address("anna"),
      subject: `${token} zur Bestellung 4711`,
      body: "Anbei der Lieferschein.",
    });
    await expect
      .poll(() => findMail("anna", token), { timeout: 15_000 })
      .toEqual({ folder: "archive", keywords: ["$seen"] });

    await deleteRule(page, new RegExp(token));
    await expect(page.getByText("Noch keine Regeln.")).toBeVisible();
  });

  test("erstellt eine Regel aus einer Mail; die Abwesenheitsnotiz bleibt an", async ({ page }) => {
    const subject = unique("Anfrage Wartung");
    await addMail("anna", "anna", subject);
    await login(page, "anna");
    await page.goto("/settings?section=vacation");
    await page.getByLabel("Abwesenheitsnotiz einschalten").check();
    await page.getByLabel("Betreff").fill("Anna ist im Urlaub");
    await page.getByLabel("Nachricht", { exact: true }).fill("Ab Montag wieder da.");
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status").filter({ hasText: "eingeschaltet" })).toBeVisible();

    await page
      .getByRole("link", { name: /^Mail($|, )/ })
      .first()
      .click();
    await page.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await page.getByRole("button", { name: "Weitere Aktionen" }).click();
    await page.getByRole("menuitem", { name: "Regel erstellen …" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Regel" });
    await expect(dialog.getByLabel("Wert")).toHaveValue("erika@example.test");
    await dialog.getByLabel("Markieren", { exact: true }).check();
    await dialog.getByRole("button", { name: "Regel speichern" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Regel gespeichert." })).toBeVisible();

    // With a rule the reply runs inside the rules script; it is still shown as on and still answers.
    await page.goto("/settings?section=vacation");
    await expect(page.getByLabel("Abwesenheitsnotiz einschalten")).toBeChecked();
    const next = unique("Nochmal Wartung");
    await deliverMail({
      from: "erika@example.test",
      fromName: "Erika Test",
      to: address("anna"),
      subject: next,
      body: "Wann passt es?",
    });
    await expect
      .poll(() => findMail("anna", next), { timeout: 15_000 })
      .toEqual({ folder: "inbox", keywords: ["$flagged"] });
    await deliverMail({
      from: address("jonas"),
      fromName: "Jonas Weber",
      to: address("anna"),
      subject: unique("Kurze Frage"),
      body: "Bist du da?",
    });
    await expect
      .poll(
        async () =>
          (await inboxMails("jonas")).some((mail) => mail.subject === "Anna ist im Urlaub"),
        { timeout: 15_000 },
      )
      .toBe(true);

    // Clean up: reply off, rule gone.
    await page.getByLabel("Abwesenheitsnotiz einschalten").uncheck();
    await page.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Gespeichert." })).toBeVisible();
    await page.goto("/settings?section=rules");
    await deleteRule(page, /erika@example\.test/);
  });
});

test.describe("Regeln auf vorhandene Mails und für gemeinsame Postfächer", () => {
  test("wendet eine neue Regel auch auf den Posteingang an", async ({ page }) => {
    const token = unique("Angebot Heizung");
    await addMail("anna", "anna", `${token} von gestern`);
    await login(page, "anna");
    await page.goto("/settings?section=rules");
    await page.getByRole("button", { name: "Neue Regel" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Regel" });
    await dialog.getByLabel("Feld").selectOption("subject");
    await dialog.getByLabel("Wert").fill(token);
    await dialog.getByLabel("In Ordner verschieben").check();
    await dialog.getByLabel("Ordner wählen").selectOption({ label: "Archiv" });
    await dialog.getByLabel("Markieren", { exact: true }).check();
    await dialog.getByLabel("Auch auf die Mails anwenden").check();
    await dialog.getByRole("button", { name: "Regel speichern" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "auf eine Mail im Posteingang angewendet" }),
    ).toBeVisible();
    expect(await findMail("anna", token)).toEqual({
      folder: "archive",
      keywords: ["$flagged", "$seen"],
    });
    await deleteRule(page, new RegExp(token));
  });

  test("der Chef legt Regeln für info@ an; sie gelten für neue und vorhandene Mails", async ({
    page,
  }) => {
    const token = unique("Reklamation");
    await addMail("jonas", "info", `${token} alt`);
    await login(page, "jonas");
    await page.goto("/settings?section=mailboxes");
    await page.getByRole("button", { name: `Regeln für ${address("info")}` }).click();
    const rules = page.getByRole("dialog", { name: `Regeln für ${address("info")}` });
    await expect(rules.getByText("Noch keine Regeln.")).toBeVisible();
    await rules.getByRole("button", { name: "Neue Regel" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Regel" });
    await dialog.getByLabel("Feld").selectOption("subject");
    await dialog.getByLabel("Wert").fill(token);
    await dialog.getByLabel("Markieren", { exact: true }).check();
    await dialog.getByLabel("Auch auf die Mails anwenden").check();
    await dialog.getByRole("button", { name: "Regel speichern" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "auf eine Mail im Posteingang angewendet" }),
    ).toBeVisible();
    await expect(rules.getByRole("list", { name: "Regeln" })).toContainText(token);
    expect(await findMail("jonas", `${token} alt`, "info")).toEqual({
      folder: "inbox",
      keywords: ["$flagged", "$seen"],
    });

    await deliverMail({
      from: "kunde@beispiel.example",
      fromName: "Ein Kunde",
      to: address("info"),
      subject: `${token} neu`,
      body: "Die Heizung ist kalt.",
    });
    await expect
      .poll(() => findMail("jonas", `${token} neu`, "info"), { timeout: 15_000 })
      .toEqual({ folder: "inbox", keywords: ["$flagged"] });

    await deleteRule(page, new RegExp(token));
    await expect(rules.getByText("Noch keine Regeln.")).toBeVisible();
  });
});

test.describe("Regeln für Mitarbeiter", () => {
  /** Takes the test's rules out of a person's list again, through the Firmenverwaltung. */
  const removeRules = async (page: Page, employeeId: string, token: string) => {
    const path = `/api/company/employees/${employeeId}/rules`;
    const { rules } = (await (await page.request.get(path)).json()) as {
      rules: { name: string; conditions: { value: string }[] }[];
    };
    const kept = rules.filter((rule) => !rule.conditions.some((c) => c.value.includes(token)));
    if (kept.length !== rules.length) await page.request.put(path, { data: { rules: kept } });
  };

  test("der Chef legt Regeln für Anna an; sie sieht sie als ihre eigenen", async ({
    page,
    browser,
  }) => {
    const token = unique("Lieferant Brötje");
    await addMail("anna", "anna", `${token} alt`);
    await login(page, "jonas");
    const employees = (await (await page.request.get("/api/company")).json()).employees as {
      id: string;
      email: string;
    }[];
    const annaId = employees.find((e) => e.email === address("anna"))!.id;
    try {
      await page.goto("/settings?section=employees");
      await page.getByRole("button", { name: /^Anna Weber/ }).click();
      await page.getByRole("dialog").getByRole("button", { name: "Regeln" }).click();
      const rules = page.getByRole("dialog", { name: "Regeln von Anna Weber" });
      await expect(rules).toContainText(`Gelten für neue Mails an ${address("anna")}`);
      await rules.getByRole("button", { name: "Neue Regel" }).click();
      const dialog = page.getByRole("dialog", { name: "Neue Regel" });
      await dialog.getByLabel("Feld").selectOption("subject");
      await dialog.getByLabel("Wert").fill(token);
      await dialog.getByLabel("Markieren", { exact: true }).check();
      await dialog.getByLabel("Auch auf die Mails anwenden").check();
      await dialog.getByRole("button", { name: "Regel speichern" }).click();
      await expect(
        page.getByRole("status").filter({ hasText: "auf eine Mail im Posteingang angewendet" }),
      ).toBeVisible();
      await expect(rules.getByRole("list", { name: "Regeln" })).toContainText(token);
      expect(await findMail("anna", `${token} alt`)).toEqual({
        folder: "inbox",
        keywords: ["$flagged", "$seen"],
      });

      // Anna finds it among her own rules, to change or delete there.
      const anna = await (await browser.newContext()).newPage();
      await login(anna, "anna");
      await anna.goto("/settings?section=rules");
      await expect(anna.getByRole("list", { name: "Regeln" })).toContainText(token);
      await anna.context().close();
    } finally {
      await removeRules(page, annaId, token);
      await removeMails("anna", "anna", [`${token} alt`]);
    }
  });
});

test.describe("Regeln am Handy @phone", () => {
  test("legt eine Regel an und löscht sie wieder @phone", async ({ page }) => {
    const token = unique("Newsletter");
    await login(page, "anna");
    await page.goto("/settings?section=rules");
    await page.getByRole("button", { name: "Neue Regel" }).click();
    const dialog = page.getByRole("dialog", { name: "Neue Regel" });
    await dialog.getByLabel("Wert").fill(token);
    await dialog.getByLabel("Als gelesen markieren").check();
    await dialog.getByRole("button", { name: "Regel speichern" }).click();
    await expect(page.getByRole("list", { name: "Regeln" }).getByRole("listitem")).toContainText(
      `Absender enthält „${token}“`,
    );
    await expect(page.getByRole("switch", { name: /ist aktiv/ })).toBeChecked();
    await deleteRule(page, new RegExp(token));
  });
});
