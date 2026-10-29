/**
 * Tasks and chat of Weber Haustechnik: they live in Kontext's own database, which the Stalwart seed
 * (dev/seed.ts) does not reach, so they are made through Kontext's API, by the people themselves
 * (each signs in with POST /api/auth/sign-in/stalwart, as the login form does).
 *
 * Used by `bun run dev` (dev/dev.ts, once per database: it stops when #baustelle-hoffmann is
 * there) and by the pictures and the film (e2e/demo-data.ts). Not by the e2e tests: they count on
 * an empty chat and task list.
 */
import { createJmapClient } from "../src/jmap/client";
import { DEV_DOMAIN, DEV_PASSWORD } from "./config";

type Person = "jonas" | "anna" | "sandra" | "max";
const PEOPLE: Person[] = ["jonas", "anna", "sandra", "max"];
const SITE_CHANNEL = "baustelle-hoffmann";

export type DemoTarget = {
  /** Where Kontext's API answers: the app (Vite proxies /api) or the server itself. */
  app: string;
  /** The app's own origin, which the server expects on changing requests; defaults to `app`. */
  origin?: string;
  /** The Stalwart the seed went into, for the mails tasks and cards point to. */
  stalwart: string;
};

type Api = <T = unknown>(
  person: Person,
  method: string,
  path: string,
  data?: unknown,
) => Promise<T>;
type Upload = <T>(person: Person, path: string, file: File) => Promise<T>;
type Channel = { id: string; kind: string; name: string | null; accountId?: string };
type Posted = { message: { id: string } };

const day = (offset: number) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(
    new Date(Date.now() + offset * 86_400_000),
  );

const address = (person: string) => `${person}@${DEV_DOMAIN}`;

/** The session cookie of one person, from the same sign-in the login form uses. */
const signIn = async ({ app, origin = app }: DemoTarget, person: Person): Promise<string> => {
  const response = await fetch(`${app}/api/auth/sign-in/stalwart`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ email: address(person), password: DEV_PASSWORD }),
  });
  if (!response.ok) throw new Error(`Anmeldung ${person}: ${response.status}`);
  return response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
};

const client = async (target: DemoTarget) => {
  const origin = target.origin ?? target.app;
  const cookies = {} as Record<Person, string>;
  for (const person of PEOPLE) cookies[person] = await signIn(target, person);
  const send = async <T>(person: Person, path: string, init: RequestInit): Promise<T> => {
    const response = await fetch(`${target.app}${path}`, {
      ...init,
      headers: { ...init.headers, cookie: cookies[person], origin },
    });
    if (!response.ok)
      throw new Error(
        `${person}: ${init.method} ${path}: ${response.status} ${await response.text()}`,
      );
    return (await response.json()) as T;
  };
  const api: Api = <T>(person: Person, method: string, path: string, data?: unknown) =>
    send<T>(person, path, {
      method,
      headers: data === undefined ? {} : { "content-type": "application/json" },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
  const upload: Upload = <T>(person: Person, path: string, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return send<T>(person, path, { method: "POST", body: form });
  };
  return { api, upload };
};

/** A mail of the seed, as a task link or chat card points to it. */
const mailRef = async (stalwart: string, user: string, mailbox: string, subject: string) => {
  const jmap = createJmapClient({
    origin: stalwart,
    credentials: { username: address(user), password: DEV_PASSWORD },
  });
  const session = await jmap.getSession();
  const accountId = Object.entries(session.accounts).find(
    ([, account]) => account.name === address(mailbox),
  )![0];
  const [, get] = await jmap.request([
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

type Ids = Record<Person, string>;

const fillTasks = async (
  api: Api,
  id: Ids,
  info: string,
  lang: { id: string; threadId: string },
) => {
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
        ref: lang.id,
        threadId: lang.threadId,
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
  // Max is no member of info@ (dev/seed-data.ts): Anna orders for him.
  await task("anna", {
    accountId: info,
    title: "Ersatzteil Umwälzpumpe bestellen",
    status: "waiting",
    assigneeId: id.anna,
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
};

type Hoffmann = Awaited<ReturnType<typeof mailRef>>;

/** The site channel: Max from the building site, Sandra with the customer's mail, Jonas. */
const fillSiteChannel = async (api: Api, upload: Upload, id: Ids, hoffmann: Hoffmann) => {
  const { channel } = await api<{ channel: Channel }>("jonas", "POST", "/api/chat/channels", {
    name: SITE_CHANNEL,
    members: [id.sandra, id.max],
  });
  const say = (person: Person, body: Record<string, unknown>) =>
    api<Posted>(person, "POST", `/api/chat/channels/${channel.id}/messages`, body);
  await say("max", {
    text: "Bin im Bad oben. Die Abflussleitung ist enger als gedacht, DN 40 statt 50.",
  });
  const pdf = new File(["%PDF-1.4\n%%EOF\n"], "Aufmass-Bad-OG.pdf", { type: "application/pdf" });
  const { file } = await upload<{ file: { id: string } }>(
    "max",
    `/api/chat/channels/${channel.id}/files`,
    pdf,
  );
  await say("max", { text: "Aufmaß dazu:", fileIds: [file.id] });
  await say("sandra", {
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
  const reply = await say("jonas", { text: "Danke. Ich kläre das mit dem größeren Rohr." });
  await api("jonas", "POST", "/api/tasks", {
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
  await say("max", { text: "Passt, ich messe morgen früh noch die Vorwand nach." });
  return channel.id as string;
};

/** A word in info@ and #allgemein, a direct message to Jonas. */
const fillOtherChats = async (api: Api, id: Ids, info: string) => {
  const say = (person: Person, channelId: string, text: string) =>
    api(person, "POST", `/api/chat/channels/${channelId}/messages`, { text });
  const { channels } = await api<{ channels: Channel[] }>("jonas", "GET", "/api/chat/channels");
  const infoChannel = channels.find((c) => c.kind === "mailbox" && c.accountId === info)!;
  await say(
    "anna",
    infoChannel.id,
    "Herr Lang ruft heute Nachmittag nochmal wegen der Wärmepumpe an.",
  );
  await say("sandra", "team", "Freitag gibt es Kuchen in der Werkstatt.");
  const { channel: direct } = await api<{ channel: Channel }>(
    "sandra",
    "POST",
    "/api/chat/direct",
    {
      members: [id.jonas],
    },
  );
  await say("sandra", direct.id, "Kannst du kurz anrufen, wenn du zurück bist?");
};

/** Whether the demo is in already: the site channel stands for all of it. */
const filled = async (api: Api) => {
  const { channels } = await api<{ channels: Channel[] }>("jonas", "GET", "/api/chat/channels");
  return channels.some((channel) => channel.name === SITE_CHANNEL);
};

/**
 * Fills tasks and chat. With `once`, nothing happens when they are in already (local
 * development); the pictures fill a fresh database each time.
 */
export const fillDemo = async (target: DemoTarget, { once = false } = {}) => {
  const { api, upload } = await client(target);
  if (once && (await filled(api))) return null;
  const id = {} as Ids;
  for (const person of PEOPLE) {
    const session = await api<{ primaryAccounts: Record<string, string> }>(
      person,
      "GET",
      "/jmap/session",
    );
    id[person] = session.primaryAccounts["urn:ietf:params:jmap:mail"]!;
  }
  const lang = await mailRef(target.stalwart, "jonas", "info", "Anfrage Wärmepumpe Neubau");
  const info = lang.accountId;
  await fillTasks(api, id, info, lang.email);
  const hoffmann = await mailRef(
    target.stalwart,
    "jonas",
    "jonas",
    "Re: Badsanierung Obergeschoss",
  );
  const channelId = await fillSiteChannel(api, upload, id, hoffmann);
  await fillOtherChats(api, id, info);
  return { channelId, infoBoard: info };
};
