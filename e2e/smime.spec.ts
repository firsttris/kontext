import { expect, test } from "@playwright/test";
import forge from "node-forge";
import { DEV_DOMAIN } from "../dev/config";
import { address, inboxSubjects, jmapAs, login, unique } from "./helpers";

const PASSWORD = "p12-passwort";

/** A self-signed S/MIME certificate for a user, as a .p12 file and its PEM. */
const certificateFor = (user: string) => {
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "0badc0de";
  cert.validity.notBefore = new Date(Date.now() - 86_400_000);
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);
  const name = [{ name: "commonName", value: address(user) }];
  cert.setSubject(name);
  cert.setIssuer(name);
  cert.setExtensions([{ name: "subjectAltName", altNames: [{ type: 1, value: address(user) }] }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const der = forge.asn1
    .toDer(forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], PASSWORD, { algorithm: "3des" }))
    .getBytes();
  return { p12: Buffer.from(der, "binary"), pem: forge.pki.certificateToPem(cert) };
};

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
    await page.getByRole("button", { name: "Senden", exact: true }).click();
    // The page was loaded anew: the certificate is closed again.
    const unlock = page.getByRole("dialog", { name: "Entsperren" });
    await unlock.getByLabel("Passwort des Zertifikats").fill(PASSWORD);
    await unlock.getByRole("button", { name: "Entsperren" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Mail gesendet." })).toBeVisible();
    await expect.poll(() => inboxSubjects("max")).toContain(subject);

    const client = jmapAs("max");
    const session = await client.getSession();
    const accountId = session.primaryAccounts["urn:ietf:params:jmap:mail"]!;
    const [found] = await client.request([
      ["Email/query", { accountId, filter: { text: "vertraulich" } }, "q"],
    ]);
    expect((found![1] as { ids: string[] }).ids).toHaveLength(0);

    await other.goto("/mail");
    const row = other
      .getByRole("list", { name: "Posteingang" })
      .getByRole("link", { name: new RegExp(subject) });
    await expect(row).toContainText("Verschlüsselt");
    await row.click();
    await expect(other.getByText("Verschlüsselt (S/MIME)", { exact: true })).toBeVisible();
    await other.getByLabel("Passwort des Zertifikats").fill(PASSWORD);
    await other.getByRole("button", { name: "Entsperren" }).click();
    await expect(
      other.frameLocator("iframe[title='Inhalt der Mail']").getByText("Az. 4711"),
    ).toBeVisible();
    await expect(
      other.getByText(`Unterschrieben von sandra@${DEV_DOMAIN} – selbst ausgestelltes Zertifikat`),
    ).toBeVisible();
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
});
