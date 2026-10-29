import { type Browser, expect } from "@playwright/test";
import { say, ui, uiPattern } from "../language";
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
  await take.hold("app", 1.3, { note: say("Die Woche des ganzen Teams", "The whole team’s week") });

  const newEvent = say("Ein neuer Termin", "A new event");
  await take.after(
    "app",
    () => page.goto(`/calendar?date=${today()}&event=new&start=${today()}T14:00`),
    0.6,
    { focus: page.getByRole("dialog"), pad: 0, note: newEvent },
  );
  const dialog = page.getByRole("dialog");
  const title = dialog.getByLabel(ui("calendar_event_title"));
  await take.type("app", title, say("Abnahme Bad", "Bathroom handover"), { note: newEvent });
  const people = dialog.getByRole("combobox", { name: ui("calendar_event_attendees") });
  await people.click();
  await take.type("app", people, "ann", { note: say("Kollegen einladen", "Invite colleagues") });
  await take.click("app", dialog.getByRole("option", { name: /Anna Weber/ }), 2.2, {
    until: () => expect(dialog.getByText(uiPattern("availability_conflict"))).toBeVisible(),
    focus: dialog.getByRole("region", { name: ui("availability_title") }),
    pad: 8,
    note: say("Kontext sieht, wer Zeit hat", "Kontext sees who is free"),
  });
  // The first suggestion on the day shown: a weekday and the time, in either language.
  const free = dialog.getByRole("button", { name: /^\p{L}+ \d\d:\d\d–/u }).first();
  await take.click("app", free, 2.0, {
    until: () => expect(dialog.getByText(uiPattern("availability_conflict"))).toHaveCount(0),
    note: say("… und schlägt vor, wann alle können", "… and suggests when everyone can"),
  });
  await take.save();
  await closeAll(page);
};
