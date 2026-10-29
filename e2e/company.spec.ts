import { expect, test } from "@playwright/test";
import { createJmapClient } from "../src/jmap/client";
import { newEmployee, signInWith, stamp } from "./company-helpers";
import { address, inboxMails, jmapAs, login, personalAccountId, STALWART, unique } from "./helpers";
import { deliverMail } from "./protocols";

/** The stand-in for Schreibzeug (dev/fake-schreibzeug.ts, playwright.config.ts). */
const SCHREIBZEUG = "http://localhost:28097";

test.describe("Firmenverwaltung", () => {
  test("nur mit dem Recht sichtbar", async ({ page }) => {
    await login(page, "anna");
    await page.goto("/settings");
    await expect(page.getByRole("link", { name: "Darstellung" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mitarbeiter" })).toHaveCount(0);
    await page.goto("/settings?section=employees");
    await expect(page.getByText("nur für Konten mit dem Recht")).toBeVisible();
  });

  test("legt einen Mitarbeiter an, der sich anmeldet, und sperrt ihn wieder", async ({
    page,
    browser,
  }) => {
    test.setTimeout(60_000);
    const local = `azubi-${stamp()}`;
    await login(page, "jonas");
    const password = await newEmployee(page, local, "Paul Azubi", "info");
    expect(password).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){3}$/);
    await expect(page.getByRole("button", { name: /Paul Azubi/ })).toBeVisible();

    const paul = await (await browser.newContext()).newPage();
    await signInWith(paul, address(local), password);
    await expect(paul).toHaveURL(/\/mail\//);
    await expect(paul.getByRole("link", { name: /^info@/ }).first()).toBeVisible();
    // In Dokumente too (the stand-in for Schreibzeug, dev/fake-schreibzeug.ts).
    await paul.goto("/documents");
    await expect(paul.frameLocator("iframe[title=Dokumente]").locator("#who")).toContainText(
      "Angemeldet als",
    );
    const sessionsInDocuments = async () =>
      (await paul.request.get(`${SCHREIBZEUG}/e2e/sessions/${address(local)}`)).json();
    expect(await sessionsInDocuments()).toBe(1);

    await page.getByRole("button", { name: /Paul Azubi/ }).click();
    const dialog = page.getByRole("dialog", { name: "Mitarbeiter bearbeiten" });
    await dialog.getByRole("button", { name: "Zugang sperren" }).click();
    await dialog.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(page.getByRole("status").filter({ hasText: "ist gesperrt" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Paul Azubi.*Gesperrt/ })).toBeVisible();

    // signed out everywhere, Dokumente included, and no new sign-in
    await expect.poll(sessionsInDocuments).toBe(0);
    await paul.reload();
    await expect(paul).toHaveURL(/\/login/);
    await signInWith(paul, address(local), password);
    await expect(paul.getByRole("alert")).toBeVisible();
  });

  test("gemeinsames Postfach mit Mitgliedern und weiterer Adresse", async ({ page }) => {
    const local = `service-${stamp()}`;
    await login(page, "jonas");
    await page.goto("/settings?section=mailboxes");
    await page.getByRole("button", { name: "Postfach anlegen" }).click();
    let dialog = page.getByRole("dialog", { name: "Postfach anlegen" });
    await dialog.getByLabel("Name vor dem @").fill(local);
    await dialog.getByLabel("Bezeichnung").fill("Kundendienst");
    await dialog.getByLabel("Zugriff für Sandra Klein").selectOption("Lesen und senden");
    await dialog.getByLabel("Zugriff für Max Becker").selectOption("Lesen und senden");
    await dialog.getByRole("button", { name: "Anlegen" }).click();
    const row = page.getByRole("button", { name: new RegExp(`^${local}@`) });
    await expect(row).toContainText("Max, Sandra");

    await row.click();
    dialog = page.getByRole("dialog", { name: "Postfach bearbeiten" });
    await dialog
      .getByLabel("Adresse hinzufügen")
      .first()
      .fill(`kd-${local}@weber-haustechnik.test`);
    await dialog.getByLabel("Adresse hinzufügen").first().press("Enter");
    await dialog.getByLabel("Zugriff für Max Becker").selectOption("Kein Zugriff");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(row).toContainText("Sandra");
    await expect(row).not.toContainText("Max");

    // a foreign domain is refused with the server's reason
    await row.click();
    await dialog.getByLabel("Adresse hinzufügen").first().fill("kd@gmail.com");
    await dialog.getByLabel("Adresse hinzufügen").first().press("Enter");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(dialog.getByRole("alert")).toContainText("gmail.com");
  });

  test("setzt am Handy ein Passwort zurück @phone", async ({ page, browser }) => {
    test.setTimeout(60_000);
    const local = `aushilfe-${stamp()}`;
    await login(page, "jonas");
    await newEmployee(page, local, "Lisa Aushilfe");
    await page.goto("/settings");
    await page.getByRole("link", { name: "Mitarbeiter" }).click();
    await page.getByRole("button", { name: /Lisa Aushilfe/ }).click();
    const dialog = page.getByRole("dialog", { name: "Mitarbeiter bearbeiten" });
    await dialog.getByRole("button", { name: "Passwort zurücksetzen" }).click();
    await dialog.getByRole("button", { name: "Ja, weiter" }).click();
    const password = (await dialog.getByTestId("new-password").textContent()) ?? "";

    const lisa = await (await browser.newContext()).newPage();
    await signInWith(lisa, address(local), password);
    await expect(lisa).toHaveURL(/\/mail\//);
  });

  test("gibt ein gemeinsames Postfach nur zum Lesen frei", async ({ page, browser }) => {
    await login(page, "jonas");
    await page.goto("/settings?section=mailboxes");
    await page.getByRole("button", { name: /^rechnung@/ }).click();
    const dialog = page.getByRole("dialog", { name: "Postfach bearbeiten" });
    await dialog.getByLabel("Zugriff für Max Becker").selectOption("Nur lesen");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("button", { name: /^rechnung@/ })).toContainText("nur lesen: Max");

    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    await max.getByRole("link", { name: "rechnung@" }).click();
    await max
      .getByRole("list", { name: "Posteingang" })
      .getByText("Rechnung 2026-117")
      .first()
      .click();
    await expect(max.getByRole("heading", { name: "Rechnung 2026-117" })).toBeVisible();
    await expect(max.getByRole("button", { name: "Löschen" })).toHaveCount(0);

    // and back, so the other tests see Max without rechnung@
    await page.getByRole("button", { name: /^rechnung@/ }).click();
    await dialog.getByLabel("Zugriff für Max Becker").selectOption("Kein Zugriff");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(page.getByRole("button", { name: /^rechnung@/ })).not.toContainText("Max");
  });

  test("trägt die Abwesenheit eines Kollegen mit Vertretung ein", async ({ page }) => {
    const local = `krank-${stamp()}`;
    await login(page, "jonas");
    await newEmployee(page, local, "Tom Krank");
    await page.getByRole("button", { name: /Tom Krank/ }).click();
    await page.getByRole("button", { name: "Abwesenheit eintragen" }).click();
    const dialog = page.getByRole("dialog", { name: "Abwesenheit von Tom Krank" });
    await dialog.getByLabel("Abwesenheitsnotiz einschalten").check();
    await dialog.getByLabel("Vertretung").selectOption({ label: "Anna Weber" });
    await dialog.getByLabel("Betreff").fill("Nicht im Büro");
    await dialog.getByRole("button", { name: "Speichern" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Abwesenheit gespeichert" }),
    ).toBeVisible();

    const id = (await page.request.get("/api/company").then((r) => r.json())).employees.find(
      (e: { email: string }) => e.email === address(local),
    ).id;
    const vacation = await page.request
      .get(`/api/company/employees/${id}/vacation`)
      .then((r) => r.json());
    expect(vacation).toMatchObject({ isEnabled: true, subject: "Nicht im Büro" });
    expect(vacation.textBody).toContain("Anna Weber (anna@weber-haustechnik.test)");
  });

  test("Firmen-Signatur für alle, mit den Angaben jeder Person", async ({ page, browser }) => {
    await login(page, "jonas");
    await page.goto("/settings?section=company-signature");
    const editor = page.getByRole("textbox", { name: "Firmen-Signatur" });
    await editor.click();
    await page.keyboard.type("[Name] · Weber Haustechnik · [E-Mail]");
    await page.keyboard.press("Enter");
    await page.keyboard.type("[Position], Tel. [Telefon]");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Mobil [Mobil]");
    await page.getByRole("button", { name: "Speichern und für alle übernehmen" }).click();
    await page.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(page.getByRole("status").filter({ hasText: "übernommen" })).toBeVisible();

    const sandra = jmapAs("sandra");
    const signatures = async () =>
      (
        await sandra.call<{ list: { email: string; textSignature: string }[] }>(
          "Identity/get",
          { accountId: await personalAccountId("sandra") },
          [
            "urn:ietf:params:jmap:core",
            "urn:ietf:params:jmap:mail",
            "urn:ietf:params:jmap:submission",
          ],
        )
      ).list;
    const own = async () =>
      (await signatures()).find((i) => i.email === address("sandra"))?.textSignature;
    // Without her details, their lines are left out.
    const before = await own();
    expect(before).toContain(`Sandra Klein · Weber Haustechnik · ${address("sandra")}`);
    expect(before).not.toContain("Tel.");
    expect(before).not.toContain("Mobil");
    expect((await signatures()).find((i) => i.email === address("info"))?.textSignature).toContain(
      address("info"),
    );

    // Sandra enters hers once; her signature has them at once, the empty mobile stays out.
    const her = await (await browser.newContext()).newPage();
    await login(her, "sandra");
    await her.goto("/settings?section=profile");
    const card = her.getByRole("region", { name: "Angaben für die Signatur" });
    await card.getByLabel("Position").fill("Kundendienst");
    await card.getByLabel("Telefon").fill("07223 4711-30");
    await card.getByRole("button", { name: "Speichern" }).click();
    await expect(her.getByRole("status")).toHaveText("Gespeichert, die Signatur ist aktualisiert.");
    await expect.poll(own).toContain("Kundendienst, Tel. 07223 4711-30");
    expect(await own()).not.toContain("Mobil");
    // Empty again for the other tests.
    await her.request.put("/api/signature-details", {
      data: { phone: "", mobile: "", position: "", department: "" },
    });

    // empty again, so the other tests start without signatures
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Delete");
    await page.getByRole("button", { name: "Speichern und für alle übernehmen" }).click();
    await page.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(page.getByRole("status").filter({ hasText: "übernommen" }).last()).toBeVisible();
  });

  test("Austritt: sperrt, übergibt das Postfach, leitet weiter und antwortet", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const local = `geht-${stamp()}`;
    await login(page, "jonas");
    const password = await newEmployee(page, local, "Karl Geht");
    await page.getByRole("button", { name: /Karl Geht/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Austritt" }).click();
    const dialog = page.getByRole("dialog", { name: "Austritt von Karl Geht" });
    await dialog.getByLabel("Postfach übergeben an").selectOption({ label: "Sandra Klein" });
    await dialog.getByLabel("Neue Mails weiterleiten an").selectOption({ label: "Anna Weber" });
    await expect(dialog.getByLabel("Nachricht")).toHaveValue(/Anna Weber \(anna@/);
    await dialog.getByRole("button", { name: "Austritt durchführen" }).click();
    await dialog.getByRole("button", { name: "Ja, weiter" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Austritt von Karl Geht" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /Karl Geht.*Gesperrt/ })).toBeVisible();

    const sandra = await (await browser.newContext()).newPage();
    await login(sandra, "sandra");
    await expect(sandra.getByRole("link", { name: `${local}@` }).first()).toBeVisible();

    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    const subject = unique("Frage an Karl");
    await max.getByRole("link", { name: "Neue Mail" }).first().click();
    await max.getByRole("combobox", { name: "An" }).fill(address(local));
    await max.keyboard.press("Enter");
    await max.getByLabel("Betreff").fill(subject);
    await max.getByRole("button", { name: "Senden", exact: true }).click();
    await expect
      .poll(async () => (await inboxMails("anna")).some((mail) => mail.subject === subject), {
        timeout: 30_000,
      })
      .toBe(true);
    await expect
      .poll(
        async () =>
          (await inboxMails("max")).some(
            (mail) => mail.subject === "Karl Geht ist nicht mehr bei uns",
          ),
        { timeout: 30_000 },
      )
      .toBe(true);

    // While Karl is gone, an out-of-office reply would not switch the offboarding off.
    await page.getByRole("button", { name: /Karl Geht/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Abwesenheit eintragen" }).click();
    await expect(page.getByRole("dialog", { name: "Abwesenheit von Karl Geht" })).toContainText(
      "Karl ist ausgetreten",
    );
    await page.keyboard.press("Escape");

    // Back again: mail stays with Karl, no more forwarding.
    await page.getByRole("button", { name: /Karl Geht/ }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Zugang wieder freigeben" }).click();
    await expect(page.getByRole("button", { name: /Karl Geht.*Gesperrt/ })).toHaveCount(0);
    const back = unique("Karl wieder da");
    await deliverMail({
      from: "kunde@beispiel.example",
      fromName: "Ein Kunde",
      to: address(local),
      subject: back,
      body: "Willkommen zurück.",
    });
    const karl = createJmapClient({
      origin: STALWART,
      credentials: { username: address(local), password },
    });
    const karlHas = async () => {
      const session = await karl.getSession();
      const accountId = Object.keys(session.accounts)[0]!;
      const { ids } = await karl.call<{ ids: string[] }>("Email/query", {
        accountId,
        filter: { subject: back },
      });
      return ids.length;
    };
    await expect.poll(karlHas, { timeout: 15_000 }).toBe(1);
    await page.waitForTimeout(2_000);
    expect((await inboxMails("anna")).some((mail) => mail.subject === back)).toBe(false);
  });
});
