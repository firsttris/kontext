import { describe, expect, it } from "vitest";
import { emailQuery, emailSet, matches } from "./emails";
import { applyPatch } from "./methods";
import { createStore, type StoredEmail } from "./store";

const mail = (fields: Partial<StoredEmail>): StoredEmail => ({
  id: "m",
  accountId: "jonas",
  threadId: "t",
  mailboxIds: { "jonas-inbox": true },
  keywords: {},
  receivedAt: "2026-10-29T10:00:00Z",
  messageId: null,
  ...fields,
});

describe("matches", () => {
  it("reads folders, keywords and operators", () => {
    const unread = mail({ subject: "Rechnung 117" });
    const filter = {
      operator: "AND",
      conditions: [{ inMailbox: "jonas-inbox" }, { notKeyword: "$seen" }],
    };
    expect(matches(unread, filter)).toBe(true);
    expect(matches({ ...unread, keywords: { $seen: true } }, filter)).toBe(false);
    expect(matches(unread, { operator: "NOT", conditions: [{ subject: "rechnung" }] })).toBe(false);
  });
});

describe("applyPatch", () => {
  it("sets and removes one keyword or folder", () => {
    const patched = applyPatch(mail({ keywords: { $flagged: true } }), {
      "keywords/$seen": true,
      "keywords/$flagged": null,
      "mailboxIds/jonas-inbox": null,
      "mailboxIds/jonas-Archiv": true,
    });
    expect(patched.keywords).toEqual({ $seen: true });
    expect(patched.mailboxIds).toEqual({ "jonas-Archiv": true });
  });
});

describe("emailQuery", () => {
  it("sorts newest first and pages", () => {
    const store = { ...createStore(Date.parse("2026-10-29T12:00:00Z")), user: "jonas" };
    const all = emailQuery(store, { accountId: "jonas", filter: { inMailbox: "jonas-inbox" } });
    const page = emailQuery(store, {
      accountId: "jonas",
      filter: { inMailbox: "jonas-inbox" },
      position: 1,
      limit: 2,
    });
    expect(page.ids).toEqual((all.ids as string[]).slice(1, 3));
    expect(page.total).toBe(all.total);
  });
});

describe("emailSet", () => {
  it("creates the composer's mail with its attachment", () => {
    const store = { ...createStore(), user: "jonas" };
    store.blobs.set("b1", new Blob(["%PDF"], { type: "application/pdf" }));
    const created = new Map<string, string>();
    const result = emailSet(
      store,
      {
        accountId: "jonas",
        create: {
          draft: {
            mailboxIds: { "jonas-drafts": true },
            subject: "Angebot",
            bodyValues: { text: { value: "Hallo Petra" }, html: { value: "<p>Hallo Petra</p>" } },
            bodyStructure: {
              type: "multipart/mixed",
              subParts: [
                {
                  type: "multipart/alternative",
                  subParts: [
                    { partId: "text", type: "text/plain" },
                    { partId: "html", type: "text/html" },
                  ],
                },
                { blobId: "b1", name: "a.pdf", type: "application/pdf", disposition: "attachment" },
              ],
            },
          },
        },
      },
      created,
    );
    const email = store.emails.get(created.get("draft")!)!;
    expect(result.created).toHaveProperty("draft");
    expect(email.preview).toBe("Hallo Petra");
    expect(email.hasAttachment).toBe(true);
    expect((email.attachments as { size: number }[])[0]!.size).toBe(4);
    expect((email.htmlBody as { partId: string }[])[0]!.partId).toBe("html");
  });
});
