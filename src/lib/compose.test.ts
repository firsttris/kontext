import { describe, expect, it } from "vitest";
import type { JmapClient } from "@/jmap/client";
import { saveDraft } from "@/jmap/mail";
import type { EmailDetail } from "@/jmap/types";
import {
  emlName,
  sharedSenderName,
  startCompose,
  startEmlForward,
  startReplyTo,
  switchReplyTo,
  withOwnReplyTo,
} from "./compose";

const original: EmailDetail = {
  id: "e1",
  threadId: "t1",
  mailboxIds: { a: true },
  keywords: {},
  from: [{ name: "Petra Keller", email: "petra@keller.test" }],
  to: [{ name: "Jonas", email: "jonas@weber.test" }],
  cc: [{ name: "Anna", email: "anna@weber.test" }],
  bcc: null,
  replyTo: null,
  subject: "Angebot <2027>",
  receivedAt: "2026-10-23T07:41:00Z",
  sentAt: "2026-10-23T07:40:00Z",
  preview: "",
  hasAttachment: true,
  size: 100,
  messageId: ["angebot@keller.test"],
  references: ["start@keller.test"],
  inReplyTo: null,
  htmlBody: [],
  textBody: [],
  attachments: [
    {
      partId: "2",
      blobId: "b1",
      type: "application/pdf",
      name: "Angebot.pdf",
      size: 5,
      cid: null,
      disposition: "attachment",
    },
  ],
  bodyStructure: null,
  bodyValues: {},
  authenticationResults: null,
  spamScore: null,
  unsubscribe: null,
  receiptTo: null,
  received: null,
  autocrypt: null,
  blobId: "b",
  contentType: null,
  unsubscribePost: null,
};

const jonas = {
  id: "i1",
  name: "Jonas",
  email: "jonas@weber.test",
  replyTo: null,
  bcc: null,
  textSignature: "",
  htmlSignature: "",
};
const office = { name: "Büro", email: "buero@weber.test" };

describe("startCompose", () => {
  it("answers the sender with the original quoted", () => {
    const start = startCompose("reply", original, "<p>Hallo</p>", ["jonas@weber.test"]);
    expect(start.to.map((a) => a.email)).toEqual(["petra@keller.test"]);
    expect(start.cc).toEqual([]);
    expect(start.subject).toBe("Re: Angebot <2027>");
    expect(start.inReplyTo).toEqual(["angebot@keller.test"]);
    expect(start.references).toEqual(["start@keller.test"]);
    expect(start.html).toContain("<blockquote><p>Hallo</p></blockquote>");
    expect(start.html).toContain("schrieb Petra Keller:");
  });
  it("answers the Reply-To address instead of the sender", () => {
    const desk = { name: "Keller Büro", email: "buero@keller.test" };
    const start = startCompose("reply", { ...original, replyTo: [desk] }, "", ["jonas@weber.test"]);
    expect(start.to).toEqual([desk]);
  });
  it("keeps the others in Cc for reply all", () => {
    const start = startCompose("replyAll", original, "", ["jonas@weber.test"]);
    expect(start.cc.map((a) => a.email)).toEqual(["anna@weber.test"]);
  });
  it("forwards with the attachments and escaped header", () => {
    const start = startCompose("forward", original, "<p>Hallo</p>", ["jonas@weber.test"]);
    expect(start.to).toEqual([]);
    expect(start.subject).toBe("Fwd: Angebot <2027>");
    expect(start.html).toContain("Angebot &lt;2027&gt;");
    expect(start.attachments).toEqual([
      { blobId: "b1", name: "Angebot.pdf", type: "application/pdf", size: 5 },
    ]);
  });
  it("reopens a draft as it was saved", () => {
    const draft = {
      ...original,
      from: [{ name: "Jonas", email: "jonas@weber.test" }],
      to: [{ name: "Petra", email: "petra@keller.test" }],
      bcc: [{ name: null, email: "archiv@weber.test" }],
      subject: "Angebot",
      inReplyTo: ["x@keller.test"],
    };
    const start = startCompose("draft", draft, "<p>Entwurf</p>", ["jonas@weber.test"]);
    expect(start).toMatchObject({
      from: "jonas@weber.test",
      subject: "Angebot",
      html: "<p>Entwurf</p>",
      inReplyTo: ["x@keller.test"],
    });
    expect(start.bcc.map((a) => a.email)).toEqual(["archiv@weber.test"]);
    expect(start.attachments).toHaveLength(1);
  });
  it("keeps each message id once in References when a reply draft is reopened", async () => {
    // Saves like the composer does and returns the Email/set create of the draft.
    const save = async (threading: Pick<EmailDetail, "inReplyTo" | "references">) => {
      let created: Partial<EmailDetail> = {};
      const client = {
        call: async (_method: string, args: { create: { draft: Partial<EmailDetail> } }) => {
          created = args.create.draft;
          return { created: { draft: { id: "d1" } } };
        },
      } as unknown as JmapClient;
      const identity = {
        id: "i1",
        name: "Jonas",
        email: "jonas@weber.test",
        replyTo: null,
        bcc: null,
        textSignature: "",
        htmlSignature: "",
      };
      const mail = { accountId: "a", identity, to: [], cc: [], bcc: [], subject: "Re: x" };
      await saveDraft(
        client,
        { ...mail, html: "", text: "", attachments: [], ...threading },
        "drafts",
      );
      return created;
    };
    const reply = startCompose("reply", original, "", ["jonas@weber.test"]);
    const first = await save(reply);
    expect(first.references).toEqual(["start@keller.test", "angebot@keller.test"]);
    const draft = {
      ...original,
      inReplyTo: first.inReplyTo ?? null,
      references: first.references ?? null,
    };
    const second = await save(startCompose("draft", draft, "", ["jonas@weber.test"]));
    expect(second.references).toEqual(["start@keller.test", "angebot@keller.test"]);
  });
  it("keeps the Reply-To of a draft through saving and reopening", async () => {
    let created: Partial<EmailDetail> = {};
    const client = {
      call: async (_method: string, args: { create: { draft: Partial<EmailDetail> } }) => {
        created = args.create.draft;
        return { created: { draft: { id: "d1" } } };
      },
    } as unknown as JmapClient;
    const info = { name: null, email: "info@weber.test" };
    await saveDraft(
      client,
      {
        accountId: "a",
        identity: jonas,
        to: [],
        cc: [],
        bcc: [],
        replyTo: [info],
        subject: "x",
        html: "",
        text: "",
        attachments: [],
      },
      "drafts",
    );
    expect(created.replyTo).toEqual([info]);
    const draft = { ...original, replyTo: created.replyTo ?? null };
    const start = startCompose("draft", draft, "", ["jonas@weber.test"]);
    expect(startReplyTo("draft", start, { ...jonas, replyTo: [office] })).toEqual([info]);
  });
  it("starts empty for a new mail", () => {
    expect(startCompose("new", original, "", []).subject).toBe("");
  });
});

describe("Reply-To defaults", () => {
  const empty = startCompose("new", null, "", []);
  it("starts a new mail with the sender's default", () => {
    expect(startReplyTo("new", empty, { ...jonas, replyTo: [office] })).toEqual([office]);
    expect(startReplyTo("reply", empty, jonas)).toEqual([]);
  });
  it("follows another sender's default, unless written by hand", () => {
    const info = { ...jonas, id: "i2", email: "info@weber.test", replyTo: [office] };
    expect(switchReplyTo([], jonas, info)).toEqual([office]);
    expect(switchReplyTo([office], info, jonas)).toEqual([]);
    const own = [{ name: null, email: "anna@weber.test" }];
    expect(switchReplyTo(own, jonas, info)).toEqual(own);
  });
});

describe("startEmlForward", () => {
  it("forwards one mail as its raw message, named after its subject", () => {
    const start = startEmlForward([{ blobId: "raw1", subject: "Angebot 2027", size: 3172 }]);
    expect(start).toMatchObject({ to: [], subject: "Fwd: Angebot 2027", html: "" });
    expect(start.attachments).toEqual([
      { blobId: "raw1", name: "Angebot 2027.eml", type: "message/rfc822", size: 3172 },
    ]);
  });
  it("puts several mails into one, without a subject", () => {
    const start = startEmlForward([
      { blobId: "raw1", subject: "Rechnung 1", size: 10 },
      { blobId: "raw2", subject: "Rechnung 2", size: 20 },
    ]);
    expect(start.subject).toBe("");
    expect(start.attachments.map((file) => file.name)).toEqual([
      "Rechnung 1.eml",
      "Rechnung 2.eml",
    ]);
  });
});

describe("emlName", () => {
  it("takes out what a file name may not hold", () => {
    expect(emlName('AW: Angebot <2027> / "Bad"?\tneu')).toBe("AW Angebot 2027 Bad neu.eml");
  });
  it("names a mail without subject", () => {
    expect(emlName(null)).toBe("Nachricht.eml");
    expect(emlName(" :: ")).toBe("Nachricht.eml");
  });
  it("keeps a long subject short", () => {
    expect(emlName("x".repeat(300))).toBe(`${"x".repeat(100)}.eml`);
  });
  it("does not cut a character in two when it shortens", () => {
    // "😀" is two UTF-16 code units; a cut between them leaves a lone surrogate in the name.
    expect(emlName(`${"x".repeat(99)}😀 Angebot`)).toBe(`${"x".repeat(99)}😀.eml`);
  });
});

describe("sharedSenderName", () => {
  it("names the person and the shared mailbox", () => {
    expect(sharedSenderName("Jonas Weber", "Weber Haustechnik")).toBe(
      "Jonas Weber (Weber Haustechnik)",
    );
    expect(sharedSenderName("", "Weber Haustechnik")).toBe("Weber Haustechnik");
    expect(sharedSenderName("Jonas Weber", "")).toBe("Jonas Weber");
  });
});

describe("withOwnReplyTo", () => {
  const shared = { ...jonas, id: "b", email: "info@weber.test" };
  it("gives a shared mailbox's identity the default set for its address in the settings", () => {
    const own = [jonas, { ...jonas, id: "d", email: "INFO@weber.test", replyTo: [office] }];
    expect(withOwnReplyTo([shared], own)).toEqual([{ ...shared, replyTo: [office] }]);
  });
  it("keeps a default the shared identity has itself", () => {
    const desk = { name: null, email: "desk@weber.test" };
    const own = [{ ...jonas, email: "info@weber.test", replyTo: [office] }];
    expect(withOwnReplyTo([{ ...shared, replyTo: [desk] }], own)[0]!.replyTo).toEqual([desk]);
  });
  it("leaves it alone without a default", () => {
    expect(withOwnReplyTo([shared], [jonas])).toEqual([shared]);
  });
});
