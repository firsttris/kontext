import { describe, expect, it } from "vitest";
import type { EmailSummary } from "@/jmap/types";
import {
  type InboxMail,
  mailsToAnnounce,
  newMails,
  reminderDelay,
  restOfToday,
  unseenCount,
} from "./notifications";

const now = new Date("2026-10-24T10:00:00Z");
const mail = (id: string, hoursAgo: number, seen = false): InboxMail => ({
  accountId: "a",
  label: "",
  email: {
    id,
    keywords: seen ? { $seen: true } : {},
    receivedAt: new Date(now.getTime() - hoursAgo * 3_600_000).toISOString(),
  } as EmailSummary,
});

describe("newMails", () => {
  it("keeps unread mail of the last three days, newest first", () => {
    const result = newMails(
      [mail("old", 80), mail("read", 1, true), mail("b", 5), mail("a", 1)],
      now,
    );
    expect(result.map((m) => m.email.id)).toEqual(["a", "b"]);
  });
});

describe("restOfToday", () => {
  const event = (key: string, start: string, end: string) => ({
    key,
    title: key,
    start: new Date(start),
    end: new Date(end),
  });
  it("keeps today's appointments that have not ended, in order", () => {
    const events = [
      event("later", "2026-10-24T14:00:00Z", "2026-10-24T15:00:00Z"),
      event("over", "2026-10-24T07:00:00Z", "2026-10-24T08:00:00Z"),
      event("now", "2026-10-24T09:30:00Z", "2026-10-24T10:30:00Z"),
      event("tomorrow", "2026-10-25T09:00:00Z", "2026-10-25T10:00:00Z"),
    ];
    expect(restOfToday(events, now, "2026-10-24").map((e) => e.key)).toEqual(["now", "later"]);
  });
});

describe("unseenCount", () => {
  it("counts what came after the bell was last opened", () => {
    const seen = now.getTime() - 3_600_000;
    expect(unseenCount([new Date(now), new Date(seen - 1)], seen)).toBe(1);
  });
});

describe("mailsToAnnounce", () => {
  it("announces each new mail once, oldest first", () => {
    const since = now.getTime() - 2 * 3_600_000;
    const mails = [mail("a", 0.5), mail("b", 1), mail("c", 3)];
    expect(mailsToAnnounce(mails, since, new Set()).map((m) => m.email.id)).toEqual(["b", "a"]);
    expect(mailsToAnnounce(mails, since, new Set(["a/b"])).map((m) => m.email.id)).toEqual(["a"]);
  });
});

describe("reminderDelay", () => {
  it("is due 15 minutes before the start, not when that has passed", () => {
    expect(reminderDelay(new Date("2026-10-24T10:30:00Z"), now)).toBe(15 * 60_000);
    expect(reminderDelay(new Date("2026-10-24T10:10:00Z"), now)).toBeUndefined();
    expect(reminderDelay(new Date("2026-10-26T10:00:00Z"), now)).toBeUndefined();
  });
});
