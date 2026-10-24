import { describe, expect, it } from "vitest";
import { mailNotices, type NewMail } from "./mail-watch";

const mail = (id: string, receivedAt: string, seen = false): NewMail => ({
  id,
  subject: `Betreff ${id}`,
  from: [{ name: "Markus Hoffmann", email: "markus@hoffmann.test" }],
  receivedAt,
  keywords: seen ? { $seen: true } : {},
});

describe("mailNotices", () => {
  const since = "2026-10-24T10:00:00Z";

  it("tells of unread mails that came after the last look, the newest first", () => {
    const notices = mailNotices(
      [
        mail("a", "2026-10-24T09:59:00Z"),
        mail("b", "2026-10-24T10:01:00Z"),
        mail("c", "2026-10-24T10:02:00Z", true),
        mail("d", "2026-10-24T10:03:00Z"),
      ],
      "jonas",
      since,
    );
    expect(notices).toEqual([
      {
        title: "Neue Mail von Markus Hoffmann",
        body: "Betreff d",
        url: "/mail/jonas/inbox?email=d",
        tag: "mail-d",
      },
      expect.objectContaining({ tag: "mail-b" }),
    ]);
  });

  it("puts many at once into one notification", () => {
    const many = ["1", "2", "3", "4"].map((id) => mail(id, `2026-10-24T10:0${id}:00Z`));
    expect(mailNotices(many, "info", since)).toEqual([
      { title: "4 neue Mails", body: "", url: "/mail/info/inbox", tag: "mail-info" },
    ]);
  });
});
