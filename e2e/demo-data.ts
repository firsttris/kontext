/**
 * Tasks and chat for the pictures of Weber Haustechnik: they live in Kontext's own database, which
 * the Stalwart seed (dev/seed.ts) does not reach, so they are made here through the API, by the
 * people themselves.
 */
import type { Browser, Page } from "@playwright/test";
import { address, jmapAs, login } from "./helpers";

type Person = "jonas" | "anna" | "sandra" | "max";

const day = (offset: number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

/** A mail of the seed, as a task link or chat card points to it. */
const mailRef = async (user: string, mailbox: string, subject: string) => {
  const client = jmapAs(user);
  const session = await client.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, a]) => a.name === address(mailbox),
  )![0];
  const [, get] = await client.request([
    // Stalwart searches the subject without "Re:"; the exact one is picked below.
    ["Email/query", { accountId, filter: { subject: subject.replace(/^Re: /, "") } }, "q"],
    [
      "Email/get",
      {
        accountId,
        "#ids": { resultOf: "q", name: "Email/query", path: "/ids" },
        properties: ["threadId", "from", "receivedAt", "subject"],
      },
      "g",
    ],
  ]);
  const email = (
    get![1].list as {
      id: string;
      threadId: string;
      subject: string;
      from: { name: string; email: string }[];
    }[]
  ).find((found) => found.subject === subject)!;
  return { accountId, email };
};

export const fillDemo = async (browser: Browser) => {
  const pages = {} as Record<Person, Page>;
  for (const person of ["jonas", "anna", "sandra", "max"] as const) {
    pages[person] = await (await browser.newContext()).newPage();
    await login(pages[person], person);
  }
  const id = {} as Record<Person, string>;
  for (const person of Object.keys(pages) as Person[]) {
    id[person] = await pages[person].evaluate(
      async () =>
        (await (await fetch("/jmap/session")).json()).primaryAccounts[
          "urn:ietf:params:jmap:mail"
        ] as string,
    );
  }
  const api = async (person: Person, method: string, path: string, data?: unknown) =>
    (await pages[person].request.fetch(path, { method, data })).json();

  // Tasks: the info@ board of the team, and Jonas's own.
  const lang = await mailRef("jonas", "info", "Anfrage Wärmepumpe Neubau");
  const info = lang.accountId;
  const task = (person: Person, fields: Record<string, unknown>) =>
    api(person, "POST", "/api/tasks", fields);
  await task("jonas", {
    accountId: info,
    title: "Angebot Wärmepumpe Lang erstellen",
    status: "doing",
    assigneeId: id.jonas,
    dueDate: day(1),
    checklist: [
      { id: "a", text: "Heizlast rechnen", done: true },
      { id: "b", text: "Angebot Hersteller einholen", done: false },
    ],
    links: [
      {
        kind: "mail",
        accountId: info,
        ref: lang.email.id,
        threadId: lang.email.threadId,
        label: "Anfrage Wärmepumpe Neubau",
        detail: "Thomas Lang",
      },
    ],
  });
  await task("anna", {
    accountId: info,
    title: "Rückruf Frau Sommer: Wasserhahn",
    assigneeId: id.anna,
    dueDate: day(0),
  });
  await task("max", {
    accountId: info,
    title: "Ersatzteil Umwälzpumpe bestellen",
    status: "waiting",
    assigneeId: id.max,
  });
  await task("sandra", {
    accountId: info,
    title: "Fliesenmuster an Hoffmann schicken",
    assigneeId: id.sandra,
    dueDate: day(2),
  });
  await task("anna", {
    accountId: info,
    title: "Wartung Keller Elektro bestätigen",
    status: "done",
    assigneeId: id.anna,
  });
  await task("jonas", {
    accountId: id.jonas,
    title: "Baubesprechung Hoffmann vorbereiten",
    dueDate: day(0),
    checklist: [
      { id: "a", text: "Fliesenauswahl mitnehmen", done: false },
      { id: "b", text: "Aufmaß Bad OG", done: true },
    ],
  });
  await task("jonas", {
    accountId: id.jonas,
    title: "Unterlagen Q3 an den Steuerberater",
    dueDate: day(3),
  });

  // Chat: the site channel, a word in info@ and #allgemein, a direct message to Jonas.
  const { channels } = await api("jonas", "GET", "/api/chat/channels");
  const infoChannel = channels.find(
    (c: { kind: string; accountId: string }) => c.kind === "mailbox" && c.accountId === info,
  );
  const { channel } = await api("jonas", "POST", "/api/chat/channels", {
    name: "baustelle-hoffmann",
    members: [id.sandra, id.max],
  });
  const say = (person: Person, channelId: string, body: Record<string, unknown>) =>
    api(person, "POST", `/api/chat/channels/${channelId}/messages`, body);
  await say("max", channel.id, {
    text: "Bin im Bad oben. Die Abflussleitung ist enger als gedacht, DN 40 statt 50.",
  });
  const upload = await pages.max.request.post(`/api/chat/channels/${channel.id}/files`, {
    multipart: {
      file: {
        name: "Aufmass-Bad-OG.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n%%EOF\n"),
      },
    },
  });
  await say("max", channel.id, { text: "Aufmaß dazu:", fileIds: [(await upload.json()).file.id] });
  const hoffmann = await mailRef("jonas", "jonas", "Re: Badsanierung Obergeschoss");
  await say("sandra", channel.id, {
    text: "@Jonas Herr Hoffmann hat heute zu den Fliesen geschrieben, passt dazu:",
    mentions: [id.jonas],
    cards: [
      {
        kind: "mail",
        accountId: hoffmann.accountId,
        ref: hoffmann.email.id,
        threadId: hoffmann.email.threadId,
        party: hoffmann.email.from[0]?.email ?? "",
        label: "Re: Badsanierung Obergeschoss",
        detail: "Markus Hoffmann",
      },
    ],
  });
  const reply = await say("jonas", channel.id, {
    text: "Danke. Ich kläre das mit dem größeren Rohr.",
  });
  await task("jonas", {
    accountId: id.jonas,
    title: "Abfluss Bad OG: größeres Rohr bestellen",
    dueDate: day(1),
    links: [
      {
        kind: "chat",
        accountId: channel.id,
        ref: reply.message.id,
        label: "Danke. Ich kläre das mit dem größeren Rohr.",
        detail: "#baustelle-hoffmann",
      },
    ],
  });
  await say("max", channel.id, { text: "Passt, ich messe morgen früh noch die Vorwand nach." });
  await say("anna", infoChannel.id, {
    text: "Herr Lang ruft heute Nachmittag nochmal wegen der Wärmepumpe an.",
  });
  await say("sandra", "team", { text: "Freitag gibt es Kuchen in der Werkstatt." });
  const { channel: direct } = await api("sandra", "POST", "/api/chat/direct", {
    members: [id.jonas],
  });
  await say("sandra", direct.id, { text: "Kannst du kurz anrufen, wenn du zurück bist?" });

  for (const page of Object.values(pages)) await page.context().close();
  return { channelId: channel.id, infoBoard: info };
};
