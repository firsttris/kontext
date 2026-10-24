import { describe, expect, it } from "vitest";
import {
  type Channel,
  channelTitle,
  insertMention,
  keptMentions,
  type Message,
  mentionQuery,
  mentionSuggestions,
  readBy,
  segments,
  sortChannels,
  sortDirect,
  timeline,
} from "./chat";

const people = [
  { id: "jonas", name: "Jonas Weber" },
  { id: "anna", name: "Anna Weber" },
  { id: "sandra", name: "Sandra Klein" },
  { id: "max", name: "Max Becker" },
];
const nameOf = (id: string) => people.find((person) => person.id === id)?.name ?? "?";

const channel = (over: Partial<Channel>): Channel => ({
  id: "c",
  kind: "channel",
  name: null,
  accountId: null,
  members: [],
  createdBy: "jonas",
  createdAt: "2026-10-01T08:00:00.000Z",
  lastMessageAt: null,
  ...over,
});

const message = (id: string, authorId: string, createdAt: string, text = "Hallo"): Message => ({
  id,
  channelId: "c",
  authorId,
  text,
  mentions: [],
  files: [],
  cards: [],
  createdAt,
});

describe("channelTitle", () => {
  const title = (c: Channel) =>
    channelTitle(c, "jonas", nameOf, () => "info@weber-haustechnik.test");

  it("names a mailbox channel after the mailbox", () => {
    expect(title(channel({ kind: "mailbox", accountId: "info" }))).toBe("info@");
  });

  it("names a direct conversation after the others", () => {
    expect(title(channel({ kind: "direct", members: ["jonas", "sandra"] }))).toBe("Sandra Klein");
    expect(title(channel({ kind: "direct", members: ["jonas", "sandra", "max"] }))).toBe(
      "Sandra, Max",
    );
  });
});

describe("sorting", () => {
  it("puts #allgemein first, then the mailboxes, then channels by name", () => {
    const list = [
      channel({ id: "b", name: "baustelle" }),
      channel({ id: "a", name: "angebote" }),
      channel({ id: "m", kind: "mailbox", accountId: "info" }),
      channel({ id: "t", kind: "team", name: "allgemein" }),
      channel({ id: "d", kind: "direct", members: ["jonas", "anna"] }),
    ];
    expect(sortChannels(list, (c) => c.name ?? "info@").map((c) => c.id)).toEqual([
      "t",
      "m",
      "a",
      "b",
    ]);
  });

  it("puts the latest direct conversation first", () => {
    const list = [
      channel({ id: "old", kind: "direct", lastMessageAt: "2026-10-20T08:00:00.000Z" }),
      channel({ id: "new", kind: "direct", lastMessageAt: "2026-10-24T08:00:00.000Z" }),
    ];
    expect(sortDirect(list).map((c) => c.id)).toEqual(["new", "old"]);
  });
});

describe("timeline", () => {
  const now = new Date("2026-10-24T12:00:00+02:00");

  it("groups one person's messages close together and marks the days", () => {
    const items = timeline(
      [
        message("1", "max", "2026-10-23T08:00:00+02:00"),
        message("2", "max", "2026-10-24T08:52:00+02:00"),
        message("3", "max", "2026-10-24T08:54:00+02:00"),
        message("4", "sandra", "2026-10-24T09:44:00+02:00"),
        message("5", "sandra", "2026-10-24T10:30:00+02:00"),
      ],
      now,
    );
    expect(items.map((item) => (item.kind === "run" ? item.messages.length : item.kind))).toEqual([
      "day",
      1,
      "day",
      2,
      1,
      1,
    ]);
    expect(items[0]).toMatchObject({ kind: "day", label: "Gestern" });
    expect(items[2]).toMatchObject({ kind: "day", label: "Heute" });
  });

  it("puts the line for new messages before the first one from someone else", () => {
    const items = timeline(
      [
        message("1", "max", "2026-10-24T08:00:00+02:00"),
        message("2", "jonas", "2026-10-24T09:00:00+02:00"),
        message("3", "max", "2026-10-24T09:01:00+02:00"),
        message("4", "max", "2026-10-24T09:02:00+02:00"),
      ],
      now,
      { me: "jonas", readUpTo: "2026-10-24T06:30:00.000Z" },
    );
    expect(items.map((item) => item.kind)).toEqual(["day", "run", "run", "new", "run"]);
    const never = timeline([message("1", "max", "2026-10-24T08:00:00+02:00")], now, {
      me: "jonas",
      readUpTo: null,
    });
    expect(never.some((item) => item.kind === "new")).toBe(false);
  });
});

describe("segments", () => {
  it("finds links and the mentions of the people mentioned", () => {
    expect(
      segments("@Jonas siehe https://example.test/plan.pdf. Danke @Anna Weber", [
        people[0]!,
        people[1]!,
      ]),
    ).toEqual([
      { kind: "mention", text: "@Jonas", id: "jonas" },
      { kind: "text", text: " siehe " },
      {
        kind: "link",
        text: "https://example.test/plan.pdf",
        href: "https://example.test/plan.pdf",
      },
      { kind: "text", text: ". Danke " },
      { kind: "mention", text: "@Anna Weber", id: "anna" },
    ]);
  });

  it("leaves names of people not mentioned as text", () => {
    expect(segments("@Max kommt", [])).toEqual([{ kind: "text", text: "@Max kommt" }]);
  });
});

describe("mentions while writing", () => {
  it("knows when an @ is being typed", () => {
    expect(mentionQuery("Hallo @an", 9)).toBe("an");
    expect(mentionQuery("@", 1)).toBe("");
    expect(mentionQuery("mail@weber", 10)).toBeNull();
    expect(mentionQuery("Hallo @anna du", 14)).toBeNull();
  });

  it("suggests colleagues by first or last name, not oneself", () => {
    expect(mentionSuggestions(people, "we", "jonas").map((p) => p.id)).toEqual(["anna"]);
    expect(mentionSuggestions(people, "", "jonas")).toHaveLength(3);
  });

  it("puts the first name in place of the query", () => {
    expect(insertMention("Hallo @an und", 9, people[1]!)).toEqual({
      text: "Hallo @Anna  und",
      caret: 12,
    });
  });

  it("keeps only the mentions still in the text", () => {
    expect(keptMentions("@Anna schau mal", [people[1]!, people[2]!])).toEqual(["anna"]);
  });
});

describe("readBy", () => {
  it("lists the others who read up to the message", () => {
    const sent = message("1", "jonas", "2026-10-24T08:00:00.000Z");
    expect(
      readBy(sent, {
        jonas: "2026-10-24T08:00:00.000Z",
        sandra: "2026-10-24T08:05:00.000Z",
        max: "2026-10-24T07:00:00.000Z",
      }),
    ).toEqual(["sandra"]);
  });
});
