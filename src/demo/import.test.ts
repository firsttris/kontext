import { describe, expect, it } from "vitest";
import { handleRequest } from "./jmap";
import { seedPim } from "./pim-seed";
import { createStore } from "./store";

const RAW = [
  "From: Jonas Weber <jonas@weber-haustechnik.test>",
  "To: anna@weber-haustechnik.test",
  "Subject: Einladung: Baubesprechung Hoffmann",
  "Message-ID: <invite-1@weber-haustechnik.test>",
  "MIME-Version: 1.0",
  'Content-Type: multipart/mixed; boundary="b"',
  "",
  "--b",
  "Content-Type: text/plain; charset=utf-8",
  "",
  "Jonas Weber lädt dich ein.",
  "--b",
  'Content-Type: text/calendar; method=REQUEST; name="invite.ics"',
  'Content-Disposition: attachment; filename="invite.ics"',
  "",
  "BEGIN:VCALENDAR",
  "METHOD:REQUEST",
  "BEGIN:VEVENT",
  "UID:baubesprechung-hoffmann",
  "END:VEVENT",
  "END:VCALENDAR",
  "--b--",
  "",
].join("\r\n");

describe("Email/import", () => {
  it("stores the message with its parts, and parse finds the invitation's event", async () => {
    const store = { ...createStore(), user: "jonas" };
    seedPim(store, Date.now());
    store.blobs.set("raw", new Blob([RAW], { type: "message/rfc822" }));
    const { methodResponses } = await handleRequest(store, {
      methodCalls: [
        [
          "Email/import",
          {
            accountId: "jonas",
            emails: { m: { blobId: "raw", mailboxIds: { "jonas-sent": true } } },
          },
          "0",
        ],
      ],
    });
    const id = (methodResponses[0]![1].created as Record<string, { id: string }>).m!.id;
    const email = store.emails.get(id)!;
    expect(email.subject).toBe("Einladung: Baubesprechung Hoffmann");
    expect(email.preview).toBe("Jonas Weber lädt dich ein.");
    const [calendar] = email.attachments as { blobId: string; type: string }[];
    expect(calendar!.type).toBe("text/calendar");

    const parse = await handleRequest(store, {
      methodCalls: [
        ["CalendarEvent/parse", { accountId: "jonas", blobIds: [calendar!.blobId] }, "0"],
      ],
    });
    const parsed = parse.methodResponses[0]![1].parsed as Record<string, { title: string }[]>;
    expect(parsed[calendar!.blobId]![0]!.title).toBe("Baubesprechung Hoffmann");
  });
});
