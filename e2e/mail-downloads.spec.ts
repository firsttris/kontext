import { readFile } from "node:fs/promises";
import { type Download, expect, type Page, test } from "@playwright/test";
import { crc32 } from "../src/lib/zip";
import { login, personalAccountId } from "./helpers";

/** The seed's mail with a winmail.dat holding a PDF and a text file (dev/seed-data.ts). */
const SUBJECT = "Lieferschein 48211";

const openDeliveryNote = async (page: Page, phone: boolean) => {
  await login(page, "jonas");
  // Phones reach the folders on a screen of their own.
  if (phone) await page.goto(`/mail/${await personalAccountId("jonas")}/inbox?folders=true`);
  await page.getByRole("link", { name: "Lieferanten" }).click();
  await page.getByRole("list", { name: "Lieferanten" }).getByText(SUBJECT).click();
  await expect(page.getByRole("list", { name: "Anhänge" })).toContainText(
    "Datenblatt Stratos 25-1-6.txt",
  );
};

/** The files in a ZIP, read from its central directory, each checked against its CRC-32. */
const zipEntries = (zip: Buffer) => {
  const end = zip.length - 22;
  expect(zip.readUInt32LE(end)).toBe(0x06054b50);
  let at = zip.readUInt32LE(end + 16);
  return Array.from({ length: zip.readUInt16LE(end + 10) }, () => {
    expect(zip.readUInt32LE(at)).toBe(0x02014b50);
    const size = zip.readUInt32LE(at + 24);
    const nameLength = zip.readUInt16LE(at + 28);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString("utf8", at + 46, at + 46 + nameLength);
    const start = local + 30 + zip.readUInt16LE(local + 26);
    const data = zip.subarray(start, start + size);
    expect(crc32(data)).toBe(zip.readUInt32LE(at + 16));
    at += 46 + nameLength;
    return { name, data };
  });
};

const contentOf = async (download: Download) => readFile(await download.path());

const downloadAll = async (page: Page, phone: boolean) => {
  await openDeliveryNote(page, phone);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Alle herunterladen" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${SUBJECT}.zip`);
  const entries = zipEntries(await contentOf(file));
  expect(entries.map((entry) => entry.name)).toEqual([
    "Lieferschein-48211.pdf",
    "Datenblatt Stratos 25-1-6.txt",
  ]);
  expect(entries[0]!.data.toString("latin1", 0, 5)).toBe("%PDF-");
  expect(entries[1]!.data.toString("utf8")).toContain("Förderhöhe max. 6 m");
};

const saveEml = async (page: Page, phone: boolean) => {
  await openDeliveryNote(page, phone);
  await page.getByRole("button", { name: "Weitere Aktionen" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Als .eml speichern" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe(`${SUBJECT}.eml`);
  const raw = (await contentOf(file)).toString("utf8");
  expect(raw).toMatch(new RegExp(`^Subject: ${SUBJECT}\\r?$`, "m"));
  expect(raw).toContain("winmail.dat");
};

test.describe("Mail herunterladen", () => {
  test("lädt alle Anhänge als ZIP herunter", async ({ page }) => downloadAll(page, false));
  test("speichert die Mail als .eml", async ({ page }) => saveEml(page, false));
});

test.describe("Mail herunterladen am Handy @phone", () => {
  test("lädt alle Anhänge als ZIP herunter @phone", async ({ page }) => downloadAll(page, true));
  test("speichert die Mail als .eml @phone", async ({ page }) => saveEml(page, true));
});
