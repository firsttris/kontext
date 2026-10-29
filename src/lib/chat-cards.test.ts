import { describe, expect, it } from "vitest";
import type { EmailSummary } from "@/jmap/types";
import type { Message } from "./chat";
import {
  contactCard,
  fitWithin,
  mailCard,
  sameCard,
  taskCard,
  taskFromMessage,
  tasksOfMessage,
} from "./chat-cards";

const email: EmailSummary = {
  id: "e1",
  threadId: "t1",
  mailboxIds: {},
  keywords: {},
  from: [{ name: "Markus Hoffmann", email: "markus@hoffmann.test" }],
  to: null,
  subject: "Re: Badsanierung Obergeschoss",
  receivedAt: "2026-10-24T07:31:00Z",
  preview: "",
  hasAttachment: false,
  size: 1,
};

const message = (text: string): Message => ({
  id: "m1",
  channelId: "c1",
  alsoInChannel: false,
  authorId: "max",
  text,
  mentions: [],
  files: [],
  cards: [],
  editedAt: null,
  deleted: false,
  parentId: null,
  reactions: [],
  replies: null,
  call: null,
  createdAt: "2026-10-24T08:00:00Z",
});

describe("cards", () => {
  it("keeps of a mail what others may see: subject, sender, time, thread", () => {
    expect(mailCard("info", email)).toMatchObject({
      kind: "mail",
      accountId: "info",
      ref: "e1",
      threadId: "t1",
      party: "markus@hoffmann.test",
      label: "Re: Badsanierung Obergeschoss",
    });
    expect(mailCard("info", email).detail).toMatch(/^Markus Hoffmann · 24\. Okt\./);
  });

  it("makes cards of tasks and contacts, and knows the same one twice", () => {
    const task = taskCard({ id: "t9", accountId: "info", title: "Rohr bestellen" });
    expect(task).toMatchObject({ kind: "task", ref: "t9", label: "Rohr bestellen" });
    expect(sameCard(task, { ...task, label: "anders" })).toBe(true);
    const contact = contactCard({
      id: "k1",
      accountId: "jonas",
      name: { full: "Petra Keller" },
      organizations: { o: { name: "Keller Elektro" } },
      emails: { e: { address: "petra@keller.test" } },
    } as never);
    expect(contact).toMatchObject({
      label: "Petra Keller",
      detail: "Keller Elektro · petra@keller.test",
    });
  });
});

describe("fitWithin", () => {
  it("shrinks the longer side to the limit and never enlarges", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 1536, height: 2048 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("taskFromMessage", () => {
  it("takes the first line as the title and links back to the message", () => {
    const { title, link } = taskFromMessage(
      message("Abfluss Bad OG: größeres Rohr bestellen\nDN 50 statt 40"),
      "#baustelle-hoffmann",
    );
    expect(title).toBe("Abfluss Bad OG: größeres Rohr bestellen");
    expect(link).toMatchObject({
      kind: "chat",
      accountId: "c1",
      ref: "m1",
      detail: "#baustelle-hoffmann",
    });
  });

  it("names a message with only a card after the card", () => {
    const withCard = { ...message(""), cards: [mailCard("info", email)] };
    expect(taskFromMessage(withCard, "#x").title).toBe("Re: Badsanierung Obergeschoss");
  });

  it("finds the tasks made from a message", () => {
    const { link } = taskFromMessage(message("Rohr"), "#x");
    expect(tasksOfMessage([{ links: [link] }, { links: [] }], "m1")).toHaveLength(1);
  });
});
