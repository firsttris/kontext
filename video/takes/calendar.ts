import { type Browser, expect } from "@playwright/test";
import { ADDRESS, closeAll, desktopOf, today } from "../screens";
import { startTake } from "../take";

/** Calendar: the team's week, a new appointment, who has time, the slot where all can. */
export const recordCalendar = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const take = await startTake("calendar", { app: { page, kind: "desktop", label: ADDRESS } });
  await page.goto("/calendar");
  await expect(
    page.locator(`[data-day="${today()}"]`).getByText("Baubesprechung Hoffmann"),
  ).toBeVisible();
  await take.hold("app", 1.3, { note: "Die Woche des ganzen Teams" });

  await take.after(
    "app",
    () => page.goto(`/calendar?date=${today()}&event=new&start=${today()}T10:00`),
    0.6,
    { focus: page.getByRole("dialog"), pad: 0, note: "Ein neuer Termin" },
  );
  const dialog = page.getByRole("dialog");
  await take.type("app", dialog.getByLabel("Titel"), "Abnahme Bad", {
    note: "Ein neuer Termin",
  });
  const people = dialog.getByRole("combobox", { name: "Teilnehmer" });
  await people.click();
  await take.type("app", people, "ann", { note: "Kollegen einladen" });
  await take.click("app", dialog.getByRole("option", { name: /Anna Weber/ }), 2.2, {
    until: () => expect(dialog.getByText(/zu dieser Zeit belegt/)).toBeVisible(),
    focus: dialog.getByRole("region", { name: "Verfügbarkeit" }),
    pad: 8,
    note: "Kontext sieht, wer Zeit hat",
  });
  const free = dialog.getByRole("button", { name: /^Mi \d\d:\d\d–/ }).first();
  await take.click("app", free, 2.0, {
    until: () => expect(dialog.getByText(/zu dieser Zeit belegt/)).toHaveCount(0),
    note: "… und schlägt vor, wann alle können",
  });
  await take.save();
  await closeAll(page);
};
