import { type Browser, expect } from "@playwright/test";
import { ADDRESS, closeAll, desktopOf } from "../screens";
import { startTake } from "../take";

/** Contacts: a customer with his mails, appointments and tasks, a small CRM. */
export const recordContacts = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const take = await startTake("contacts", { app: { page, kind: "desktop", label: ADDRESS } });
  await page.goto("/contacts");
  await expect(page.getByRole("link", { name: /Markus Hoffmann/ })).toBeVisible();
  await take.hold("app", 1.0, { note: "Alle Kunden der Firma" });
  await take.click("app", page.getByRole("link", { name: /Markus Hoffmann/ }), 3.2, {
    until: () => expect(page.getByText("Re: Badsanierung Obergeschoss")).toBeVisible(),
    focus: page.getByRole("main"),
    pad: 0,
    note: "Letzte Mails, nächste Termine, offene Aufgaben",
  });
  await take.save();
  await closeAll(page);
};
