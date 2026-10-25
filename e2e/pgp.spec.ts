import { expect, test } from "@playwright/test";
import { readKey } from "openpgp";
import { DEV_DOMAIN } from "../dev/config";
import { wkdHash } from "../server/pgp/keys";
import { inboxSubjects, login, unique } from "./helpers";

test.describe("Verschlüsselung: persönlicher Schlüssel", () => {
  test("anlegen, Code aufheben, über den Code neu setzen; Autocrypt und WKD", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    await login(page, "anna");
    await page.goto("/settings?section=encryption");
    const own = page.getByRole("region", { name: "Mein Schlüssel" });
    await own.getByRole("button", { name: "Schlüssel anlegen" }).click();
    const dialog = page.getByRole("dialog", { name: "Schlüssel anlegen" });
    await dialog.getByLabel("Neue Passphrase").fill("kurz");
    await dialog.getByLabel("Passphrase wiederholen").fill("kurz");
    await expect(dialog.getByRole("alert")).toHaveText("Mindestens 10 Zeichen.");
    await dialog.getByLabel("Neue Passphrase").fill("Im Keller steht die Pumpe");
    await dialog.getByLabel("Passphrase wiederholen").fill("Im Keller steht die Pumpe");
    await dialog.getByRole("button", { name: "Weiter" }).click();
    const code = (await dialog
      .getByRole("status", { name: "Wiederherstellungscode" })
      .textContent())!;
    expect(code).toMatch(/^([A-Z2-9]{4}-){5}[A-Z2-9]{4}$/);
    const save = dialog.getByRole("button", { name: "Schlüssel speichern" });
    await expect(save).toBeDisabled();
    await dialog.getByLabel("Ich habe den Code sicher aufbewahrt.").check();
    await save.click();
    await expect(
      page.getByRole("status").filter({ hasText: "Schlüssel gespeichert." }),
    ).toBeVisible();
    await expect(own).toContainText(`anna@${DEV_DOMAIN}`);
    await expect(own).toContainText(/([0-9A-F]{4} ){9}[0-9A-F]{4}/);

    // Passphrase forgotten: the recovery code sets a new one.
    await own.getByRole("button", { name: "Passphrase vergessen?" }).click();
    const forgot = page.getByRole("dialog", { name: "Passphrase vergessen?" });
    await forgot.getByLabel("Wiederherstellungscode").fill(code.toLowerCase().replace(/-/g, " "));
    await forgot.getByLabel("Neue Passphrase").fill("Die Pumpe steht im Keller");
    await forgot.getByLabel("Passphrase wiederholen").fill("Die Pumpe steht im Keller");
    await forgot.getByRole("button", { name: "Speichern" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Passphrase geändert." }),
    ).toBeVisible();

    // WKD: Thunderbird finds the key at the company's address.
    const wkd = await page.request.get(
      `/.well-known/openpgpkey/${DEV_DOMAIN}/hu/${await wkdHash("anna")}?l=anna`,
    );
    expect(wkd.status()).toBe(200);
    const key = await readKey({ binaryKey: new Uint8Array(await wkd.body()) });
    expect(key.getUserIDs()[0]).toContain(`anna@${DEV_DOMAIN}`);

    // A mail from Anna carries the key; Max's Kontext takes it over when he opens it.
    const subject = unique("Mit Schlüssel");
    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill(`max@${DEV_DOMAIN}`);
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill(subject);
    await page.getByRole("textbox", { name: "Ihre Nachricht …" }).fill("Hallo Max");
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Mail gesendet.");
    await expect.poll(() => inboxSubjects("max")).toContain(subject);

    const max = await (await browser.newContext()).newPage();
    await login(max, "max");
    await max.getByRole("list", { name: "Posteingang" }).getByText(subject).click();
    await expect(max.getByRole("heading", { name: subject })).toBeVisible();
    await max.goto("/settings?section=encryption");
    const known = max.getByRole("region", { name: "Schlüssel von anderen" });
    await expect(known).toContainText(`anna@${DEV_DOMAIN}`);
    await expect(known).toContainText("Aus einer Mail (Autocrypt)");
    await max.context().close();
  });
});
