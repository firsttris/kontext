import { expect, test } from "@playwright/test";
import forge from "node-forge";
import { login, unique } from "./helpers";

const DAY = 86_400_000;

/** An authority of its own and a certificate for mail it issued; neither known anywhere. */
const authorityWithLeaf = (organization: string) => {
  const caKeys = forge.pki.rsa.generateKeyPair(1024);
  const ca = forge.pki.createCertificate();
  ca.publicKey = caKeys.publicKey;
  ca.serialNumber = "0d";
  ca.validity.notBefore = new Date(Date.now() - DAY);
  ca.validity.notAfter = new Date(Date.now() + 365 * DAY);
  const name = [{ name: "organizationName", value: organization }];
  ca.setSubject(name);
  ca.setIssuer(name);
  ca.setExtensions([{ name: "basicConstraints", cA: true }]);
  ca.sign(caKeys.privateKey, forge.md.sha256.create());
  const keys = forge.pki.rsa.generateKeyPair(1024);
  const leaf = forge.pki.createCertificate();
  leaf.publicKey = keys.publicKey;
  leaf.serialNumber = "0e";
  leaf.validity.notBefore = ca.validity.notBefore;
  leaf.validity.notAfter = ca.validity.notAfter;
  leaf.setSubject([{ name: "commonName", value: "amt@land.test" }]);
  leaf.setIssuer(name);
  leaf.setExtensions([
    { name: "subjectAltName", altNames: [{ type: 1, value: "amt@land.test" }] },
    { name: "extKeyUsage", emailProtection: true },
  ]);
  leaf.sign(caKeys.privateKey, forge.md.sha256.create());
  return {
    ca: forge.pki.certificateToPem(ca),
    der: Buffer.from(forge.asn1.toDer(forge.pki.certificateToAsn1(ca)).getBytes(), "binary"),
    leaf: forge.pki.certificateToPem(leaf),
  };
};

test.describe("Firmenverwaltung: S/MIME-Stellen", () => {
  test("eine Stelle hinzufügen macht ihre Zertifikate vertrauenswürdig, entfernen nicht mehr", async ({
    page,
  }) => {
    const organization = unique("Landesverwaltung");
    const made = authorityWithLeaf(organization);
    await login(page);
    const trust = async () =>
      (
        (await (
          await page.request.post("/api/smime/trust", { data: { certificate: made.leaf } })
        ).json()) as { trust: { chain: string } }
      ).trust.chain;
    expect(await trust()).toBe("untrusted");
    try {
      await page.goto("/settings?section=company-smime");
      // DER, as .cer files usually come.
      await page
        .getByLabel("Zertifikat einer Stelle hinzufügen")
        .setInputFiles({ name: "stelle.cer", mimeType: "application/pkix-cert", buffer: made.der });
      await expect(
        page.getByRole("status").filter({ hasText: "Stelle hinzugefügt." }),
      ).toBeVisible();
      const list = page.getByRole("list", { name: "Anerkannte Stellen" });
      const row = list.getByRole("listitem").filter({ hasText: organization });
      await expect(row).toContainText("Wurzel");
      await expect(row).toContainText(/gültig .+ bis .+/);
      expect(await trust()).toBe("trusted");

      page.once("dialog", (dialog) => void dialog.accept());
      await row.getByRole("button", { name: `${organization} entfernen` }).click();
      await expect(page.getByRole("status").filter({ hasText: "Stelle entfernt." })).toBeVisible();
      await expect(list.getByRole("listitem").filter({ hasText: organization })).toHaveCount(0);
      expect(await trust()).toBe("untrusted");
    } finally {
      // Whatever happened above: the company keeps no test authority.
      const { authorities } = (await (
        await page.request.get("/api/company/smime-authorities")
      ).json()) as { authorities: { fingerprint: string; subject: string }[] };
      for (const authority of authorities.filter((entry) => entry.subject === organization)) {
        await page.request.delete(
          `/api/company/smime-authorities/${encodeURIComponent(authority.fingerprint)}`,
        );
      }
    }
  });
});
