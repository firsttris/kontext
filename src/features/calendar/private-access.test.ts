import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "@/lib/jscalendar";
import { type CalendarRef, isOthersPrivate, mayEdit } from "./queries";

const ref = (over: Record<string, unknown>): CalendarRef =>
  ({
    key: "g:1",
    accountId: "g",
    isPersonal: false,
    owner: "info@weber.test",
    ownerEmail: "info@weber.test",
    name: "Kalender",
    color: "#000",
    calendar: { id: "1" },
    mayWrite: true,
    visible: true,
    ...over,
  }) as unknown as CalendarRef;

const event = {
  id: "e",
  accountId: "g",
  calendarIds: { "1": true },
  title: "Arzttermin",
  start: "2026-11-05T10:00:00",
  privacy: "private",
} as CalendarEvent;

describe("private events of a shared mailbox", () => {
  // Stalwart counts a group's members as its owner (AccessToken::is_member in
  // crates/common/src/auth/access_token.rs, EventViewer::of in crates/groupware/src/calendar/
  // privacy.rs): they get the whole event and may change it.
  it("lets a member of info@ change a private event in its calendar", () => {
    const info = ref({ isOwner: true });
    expect(isOthersPrivate(info, event)).toBe(false);
    expect(mayEdit(info, event, ["jonas@weber.test"])).toBe(true);
  });

  it("keeps a colleague's private event locked", () => {
    const anna = ref({ accountId: "a", owner: "Anna", ownerEmail: "anna@weber.test" });
    expect(isOthersPrivate(anna, { ...event, title: undefined })).toBe(true);
    expect(mayEdit(anna, event, ["jonas@weber.test"])).toBe(false);
  });
});
