import { expect, test } from "@playwright/test";
import { DEV_PASSWORD, STALWART_ADMIN } from "../dev/config";
import { CAPABILITIES, createJmapClient } from "../src/jmap/client";
import { newEmployee, stamp } from "./company-helpers";
import { pstFixture } from "./fixtures";
import { address, jmapAs, login, personalAccountId, STALWART } from "./helpers";

test.describe("Umzug", () => {
  test("Umzug aus Outlook: PST hochladen, zweimal ohne Doppelte", async ({ page }) => {
    test.setTimeout(120_000);
    const local = `umzug-${stamp()}`;
    await login(page, "jonas");
    await newEmployee(page, local, "Uwe Umzug");
    await page.goto("/settings?section=migration");

    const upload = async (file: string) => {
      await page.getByRole("button", { name: "Datei hochladen" }).click();
      const dialog = page.getByRole("dialog", { name: "Datei hochladen" });
      await dialog.getByLabel("Für").selectOption({ label: `Uwe Umzug (${address(local)})` });
      await dialog.getByLabel("Datei (.pst, .vcf oder .ics)").setInputFiles(file);
      await dialog.getByRole("button", { name: "Hochladen und übernehmen" }).click();
      await expect(dialog).toBeHidden({ timeout: 30_000 });
    };
    const job = (file: string) => page.getByRole("listitem", { name: file }).first();

    await upload(await pstFixture("enron.pst"));
    await expect(job("enron.pst")).toContainText("Fertig", { timeout: 60_000 });
    await expect(job("enron.pst")).toContainText("71 von 71 übernommen");

    await upload(await pstFixture("dist-list.pst"));
    await expect(job("dist-list.pst")).toContainText("Fertig", { timeout: 60_000 });
    await expect(job("dist-list.pst")).toContainText("Kontakte1 von 1 übernommen");
    await expect(job("dist-list.pst")).toContainText("Termine1 von 1 übernommen");

    // the same file again: nothing twice
    await upload(await pstFixture("enron.pst"));
    await expect(job("enron.pst")).toContainText("71 schon vorhanden", { timeout: 60_000 });
  });

  test("Umzug von einem anderen Anbieter: Labels als Ordner, ohne Doppelte, abschließen", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const stamp_ = stamp();
    // The "old provider" is Max's mailbox over IMAP: one mail under two labels, one under one.
    const max = jmapAs("max");
    const maxId = await personalAccountId("max");
    const using = [CAPABILITIES.core, CAPABILITIES.mail, CAPABILITIES.blob];
    const [created] = await max.request(
      [
        [
          "Mailbox/set",
          {
            accountId: maxId,
            create: { a: { name: `Label A ${stamp_}` }, b: { name: `Label B ${stamp_}` } },
          },
          "f",
        ],
      ],
      using,
    );
    const folders = created![1].created as Record<string, { id: string }>;
    const mail = (subject: string) =>
      Buffer.from(
        `From: kunde@example.org\r\nTo: ${address("max")}\r\nSubject: ${subject}\r\nMessage-ID: <${subject.replace(/\s/g, "-")}@example.org>\r\nDate: Mon, 20 Oct 2026 09:00:00 +0200\r\n\r\nHallo\r\n`,
      ).toString("base64");
    await max.request(
      [
        [
          "Blob/upload",
          {
            accountId: maxId,
            create: {
              x: {
                data: [{ "data:asBase64": mail(`Zwei Labels ${stamp_}`) }],
                type: "message/rfc822",
              },
              y: {
                data: [{ "data:asBase64": mail(`Ein Label ${stamp_}`) }],
                type: "message/rfc822",
              },
            },
          },
          "u",
        ],
        [
          "Email/import",
          {
            accountId: maxId,
            emails: {
              x: {
                blobId: "#x",
                mailboxIds: { [folders.a!.id]: true, [folders.b!.id]: true },
                keywords: { $seen: true, $flagged: true },
              },
              y: { blobId: "#y", mailboxIds: { [folders.a!.id]: true }, keywords: {} },
            },
          },
          "i",
        ],
      ],
      using,
    );

    const local = `ziel-${stamp_}`;
    await login(page, "jonas");
    await newEmployee(page, local, "Zora Ziel");
    await page.goto("/settings?section=migration");
    await page.getByRole("button", { name: "Postfach verbinden" }).click();
    const dialog = page.getByRole("dialog", { name: "Postfach verbinden" });
    await dialog.getByLabel("Für").selectOption({ label: `Zora Ziel (${address(local)})` });
    await dialog.getByLabel("Anbieter").selectOption({ label: "Anderer Server" });
    await dialog.getByLabel("Server", { exact: true }).fill("127.0.0.1");
    await dialog.getByLabel("Port").fill("20143");
    await dialog.getByLabel("Bisherige E-Mail-Adresse").fill(address("max"));
    await dialog.getByLabel("Passwort", { exact: true }).fill("falsch-falsch-falsch");
    await dialog.getByRole("button", { name: "Verbinden und übernehmen" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Anmeldung abgelehnt");
    await dialog.getByLabel("Passwort", { exact: true }).fill(DEV_PASSWORD);
    await dialog.getByRole("button", { name: "Verbinden und übernehmen" }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // Max's mailbox also holds the seed's invitations; the numbers only must not change later.
    const row = page.getByRole("listitem", { name: address("max") });
    await expect(row).toContainText("1 in weitere Ordner", { timeout: 30_000 });
    const imported = (await row.textContent())?.match(/(\d+) Mails übernommen/)?.[0] ?? "";
    expect(imported).not.toBe("");

    // In the new mailbox: the mail with two labels once, in both folders, read and flagged.
    const admin = createJmapClient({
      origin: STALWART,
      credentials: { username: STALWART_ADMIN.user, password: STALWART_ADMIN.password },
    });
    const id = (await page.request.get("/api/company").then((r) => r.json())).employees.find(
      (e: { email: string }) => e.email === address(local),
    ).id;
    const [, get, boxes] = await admin.request(
      [
        ["Email/query", { accountId: id, filter: { subject: `Zwei Labels ${stamp_}` } }, "q"],
        [
          "Email/get",
          {
            accountId: id,
            "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
            properties: ["mailboxIds", "keywords"],
          },
          "g",
        ],
        ["Mailbox/get", { accountId: id, properties: ["name"] }, "m"],
      ],
      [CAPABILITIES.core, CAPABILITIES.mail],
    );
    const [twoLabels] = get![1].list as {
      mailboxIds: Record<string, true>;
      keywords: Record<string, true>;
    }[];
    const names = Object.fromEntries(
      (boxes![1].list as { id: string; name: string }[]).map((box) => [box.id, box.name]),
    );
    expect(
      Object.keys(twoLabels!.mailboxIds)
        .map((box) => names[box])
        .sort(),
    ).toEqual([`Label A ${stamp_}`, `Label B ${stamp_}`]);
    expect(twoLabels!.keywords).toEqual({ $seen: true, $flagged: true });

    // A second run brings nothing twice; then the move is finished.
    await row.getByRole("button", { name: "Jetzt abgleichen" }).click();
    await expect(row).toContainText("Letzter Abgleich");
    await expect(row).toContainText(imported);
    await expect(row).toContainText("1 in weitere Ordner");
    await row.getByRole("button", { name: "Umzug abschließen" }).click();
    await row.getByRole("button", { name: "Ja, weiter" }).click();
    const done = page.getByRole("dialog", { name: "Umzug abgeschlossen" });
    await expect(done).toContainText(address(local));
    await done.getByRole("button", { name: "Fertig" }).click();
    await expect(row).toContainText("Abgeschlossen");
  });

  test("Kontakte und Kalender aus dem Google-Export", async ({ page }) => {
    const local = `google-${stamp()}`;
    await login(page, "jonas");
    await newEmployee(page, local, "Gina Google");
    await page.goto("/settings?section=migration");
    const upload = async (name: string, text: string, mimeType: string) => {
      await page.getByRole("button", { name: "Datei hochladen" }).click();
      const dialog = page.getByRole("dialog", { name: "Datei hochladen" });
      await dialog.getByLabel("Für").selectOption({ label: `Gina Google (${address(local)})` });
      await dialog
        .getByLabel("Datei (.pst, .vcf oder .ics)")
        .setInputFiles({ name, mimeType, buffer: Buffer.from(text) });
      await dialog.getByRole("button", { name: "Hochladen und übernehmen" }).click();
      await expect(dialog).toBeHidden();
    };
    const card = (name: string, mail: string) =>
      `BEGIN:VCARD\r\nVERSION:3.0\r\nFN:${name}\r\nN:${name.split(" ").reverse().join(";")};;;\r\nEMAIL:${mail}\r\nEND:VCARD\r\n`;
    await upload(
      "contacts.vcf",
      card("Erika Muster", "erika@example.org") + card("Hans Beispiel", "hans@example.org"),
      "text/vcard",
    );
    const event = (uid: string, title: string, day: string) =>
      `BEGIN:VEVENT\r\nUID:${uid}\r\nDTSTAMP:20261001T080000Z\r\nDTSTART:${day}T080000Z\r\nDTEND:${day}T090000Z\r\nSUMMARY:${title}\r\nEND:VEVENT\r\n`;
    await upload(
      "kalender.ics",
      `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Google Inc//Google Calendar 70.9054//EN\r\n${event(
        `a-${local}@google.com`,
        "Zahnarzt",
        "20261105",
      )}${event(`b-${local}@google.com`, "Messe", "20261112")}END:VCALENDAR\r\n`,
      "text/calendar",
    );
    await expect(page.getByRole("listitem", { name: "contacts.vcf" })).toContainText(
      "Kontakte2 von 2 übernommen",
      { timeout: 30_000 },
    );
    await expect(page.getByRole("listitem", { name: "kalender.ics" })).toContainText(
      "Termine2 von 2 übernommen",
      { timeout: 30_000 },
    );
  });
});
