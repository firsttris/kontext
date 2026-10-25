import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import forge from "node-forge";
import { DEV_DOMAIN } from "../dev/config";
import { address, inboxSubjects, jmapAs, login, unique } from "./helpers";

const PASSWORD = "p12-passwort";

/** The tests' own authority, which the e2e server trusts (playwright.config.ts SMIME_ROOTS). */
const testCa = {
  cert: forge.pki.certificateFromPem(readFileSync("e2e/smime-ca/root.pem", "utf8")),
  key: forge.pki.privateKeyFromPem(readFileSync("e2e/smime-ca/root.key", "utf8")),
};

/**
 * An S/MIME certificate for a user, as a .p12 file and its PEM: self-signed, or issued by an
 * authority.
 */
const certificateFor = (
  user: string,
  by?: { cert: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey },
) => {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0badc0de";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const name = [{ name: "commonName", value: address(user) }];
  cert.setSubject(name);
  cert.setIssuer(by ? by.cert.subject.attributes : name);
  cert.setExtensions([
    { name: "subjectAltName", altNames: [{ type: 1, value: address(user) }] },
    { name: "extKeyUsage", emailProtection: true },
  ]);
  cert.sign(by?.key ?? keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1
    .toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSWORD, { algorithm: "3des" }))
    .getBytes();
  return { p12: Buffer.from(der, "binary"), pem: forge.pki.certificateToPem(cert) };
};

const STAND_IN = "Vertrauliche Nachricht";

test.describe("Verschlüsselung: S/MIME", () => {
  test("Zertifikat importieren, verschlüsselt senden, beim Empfänger lesen und das Zertifikat merken", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const subject = unique("Bescheid Bauamt");
    const sandra = certificateFor("sandra");
    const max = certificateFor("max");

    await login(page, "sandra");
    // A retry starts clean: the first attempt may have imported the certificate already.
    await page.request.delete("/api/smime/me");
    await page.goto("/settings?section=encryption");
    const own = page.getByRole("region", { name: "Mein S/MIME-Zertifikat" });
    await own.getByRole("button", { name: "Zertifikat importieren" }).click();
    const dialog = page.getByRole("dialog", { name: "Zertifikat importieren" });
    await dialog
      .getByLabel("Datei (.p12, .pfx)")
      .setInputFiles({ name: "sandra.p12", mimeType: "application/x-pkcs12", buffer: sandra.p12 });
    await dialog.getByLabel("Passwort des Zertifikats").fill("falsch");
    await dialog.getByRole("button", { name: "Zertifikat importieren" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Das Passwort stimmt nicht");
    await dialog.getByLabel("Passwort des Zertifikats").fill(PASSWORD);
    await dialog.getByRole("button", { name: "Zertifikat importieren" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Zertifikat gespeichert." }),
    ).toBeVisible();
    await expect(own).toContainText(address("sandra"));
    await expect(own).toContainText("Gültig bis");

    // Max's certificate, from a file.
    const known = page.getByRole("region", { name: "S/MIME-Zertifikate von anderen" });
    await known.getByLabel("Zertifikat aus Datei (.cer, .pem)").setInputFiles({
      name: "max.pem",
      mimeType: "application/x-pem-file",
      buffer: Buffer.from(max.pem),
    });
    await expect(known.getByRole("list")).toContainText(address("max"));

    const other = await (await browser.newContext()).newPage();
    await login(other, "max");
    const saved = await other.request.put("/api/smime/me", {
      data: { certificate: max.pem, p12: max.p12.toString("base64") },
    });
    expect(saved.ok()).toBe(true);

    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill(address("max"));
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill(subject);
    await page
      .getByRole("textbox", { name: "Ihre Nachricht …" })
      .fill("Der Bescheid ist vertraulich: Az. 4711.");
    await page.getByRole("button", { name: "Vertraulich senden" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Verschlüsselt und unterschrieben (S/MIME)" }),
    ).toBeVisible();
    const before = (await inboxSubjects("max")).filter((s) => s === STAND_IN).length;
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    // The page was loaded anew: the certificate is closed again.
    const unlock = page.getByRole("dialog", { name: "Entsperren" });
    await unlock.getByLabel("Passwort des Zertifikats").fill(PASSWORD);
    await unlock.getByRole("button", { name: "Entsperren" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();
    // The subject went inside; outside it says "Vertrauliche Nachricht" (Protected Headers).
    await expect
      .poll(async () => (await inboxSubjects("max")).filter((s) => s === STAND_IN).length)
      .toBe(before + 1);
    expect(await inboxSubjects("max")).not.toContain(subject);

    const client = jmapAs("max");
    const session = await client.getSession();
    const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"]!;
    const [found] = await client.request([
      ["Email/query", { accountId, filter: { text: "Bescheid" } }, "q"],
    ]);
    expect((found![1] as { ids: string[] }).ids).toHaveLength(0);

    await other.goto("/mail");
    const row = other
      .getByRole("list", { name: "Posteingang" })
      .getByRole("link", { name: new RegExp(STAND_IN) })
      .first();
    await expect(row).toContainText("Verschlüsselt");
    await row.click();
    const list = other.getByRole("list", { name: "Posteingang" });
    await expect(other.getByText("Verschlüsselt (S/MIME)", { exact: true })).toBeVisible();
    await other.getByLabel("Passwort des Zertifikats").fill(PASSWORD);
    await other.getByRole("button", { name: "Entsperren" }).click();
    await expect(
      other.frameLocator("iframe[title='Inhalt der Mail']").getByText("Az. 4711"),
    ).toBeVisible();
    await expect(
      other.getByText(`Unterschrieben von sandra@${DEV_DOMAIN} – selbst ausgestelltes Zertifikat`),
    ).toBeVisible();
    // Opened, the real subject shows in the mail and in the list.
    await expect(other.getByRole("heading", { name: subject })).toBeVisible();
    await expect(list).toContainText(subject);
    // Sandra's certificate came with her signature.
    await expect
      .poll(async () =>
        (
          (await (await other.request.get("/api/smime/certs")).json()) as {
            certs: { email: string }[];
          }
        ).certs.map((cert) => cert.email),
      )
      .toContain(address("sandra"));
    await other.context().close();
  });

  test("nur unterschreiben: lesbar für alle, die Unterschrift wird geprüft", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const subject = unique("Antrag unterschrieben");
    const sandra = certificateFor("sandra");
    await login(page, "sandra");
    const saved = await page.request.put("/api/smime/me", {
      data: { certificate: sandra.pem, p12: sandra.p12.toString("base64") },
    });
    expect(saved.ok()).toBe(true);
    await page.goto("/mail");
    await page.getByRole("link", { name: "Neue Mail" }).first().click();
    await page.getByRole("combobox", { name: "An" }).fill(address("max"));
    await page.keyboard.press(",");
    await page.getByLabel("Betreff").fill(subject);
    await page.getByRole("textbox", { name: "Ihre Nachricht …" }).fill("Hiermit beantrage ich.");
    await page.getByRole("button", { name: "Unterschreiben" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Unterschrieben mit deinem S/MIME-Zertifikat" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    const unlock = page.getByRole("dialog", { name: "Entsperren" });
    await unlock.getByLabel("Passwort des Zertifikats").fill(PASSWORD);
    await unlock.getByRole("button", { name: "Entsperren" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();
    // Not encrypted: the subject is the real one.
    await expect.poll(() => inboxSubjects("max")).toContain(subject);

    const other = await (await browser.newContext()).newPage();
    await login(other, "max");
    await other
      .getByRole("list", { name: "Posteingang" })
      .getByRole("link", { name: new RegExp(subject) })
      .click();
    await expect(
      other.frameLocator("iframe[title='Inhalt der Mail']").getByText("Hiermit beantrage ich."),
    ).toBeVisible();
    await expect(
      other.getByText(`Unterschrieben von sandra@${DEV_DOMAIN} – selbst ausgestelltes Zertifikat`),
    ).toBeVisible();
    await other.context().close();
  });

  test("eine Unterschrift von einer anerkannten Stelle wird bestätigt, von einer unbekannten nicht", async ({
    page,
    browser,
  }) => {
    test.setTimeout(90_000);
    const other = await (await browser.newContext()).newPage();
    await login(other, "max");
    await login(page, "sandra");
    const stranger = (() => {
      const keys = forge.pki.rsa.generateKeyPair(1024);
      const cert = forge.pki.createCertificate();
      cert.publicKey = keys.publicKey;
      cert.serialNumber = "0c";
      cert.validity.notBefore = new Date(Date.now() - 86_400_000);
      cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
      const name = [{ name: "organizationName", value: "Unbekannte Stelle" }];
      cert.setSubject(name);
      cert.setIssuer(name);
      cert.setExtensions([{ name: "basicConstraints", cA: true }]);
      cert.sign(keys.privateKey, forge.md.sha256.create());
      return { cert, key: keys.privateKey };
    })();
    for (const [by, says] of [
      [testCa, "bestätigt von Kontext Test-CA"],
      [stranger, "einer Stelle, die Kontext nicht als anerkannt kennt"],
    ] as const) {
      const subject = unique("Signiert");
      const made = certificateFor("sandra", by);
      await page.request.put("/api/smime/me", {
        data: { certificate: made.pem, p12: made.p12.toString("base64") },
      });
      await page.goto("/mail");
      await page.getByRole("link", { name: "Neue Mail" }).first().click();
      await page.getByRole("combobox", { name: "An" }).fill(address("max"));
      await page.keyboard.press(",");
      await page.getByLabel("Betreff").fill(subject);
      await page.getByRole("textbox", { name: "Ihre Nachricht …" }).fill("Mit Unterschrift.");
      await page.getByRole("button", { name: "Unterschreiben" }).click();
      await page.getByRole("button", { name: "Senden", exact: true }).click();
      const unlock = page.getByRole("dialog", { name: "Entsperren" });
      await unlock.getByLabel("Passwort des Zertifikats").fill(PASSWORD);
      await unlock.getByRole("button", { name: "Entsperren" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();
      await expect.poll(() => inboxSubjects("max")).toContain(subject);
      await other.goto("/mail");
      await other
        .getByRole("list", { name: "Posteingang" })
        .getByRole("link", { name: new RegExp(subject) })
        .click();
      await expect(other.getByRole("note")).toContainText(says);
    }
    await other.context().close();
  });
});
