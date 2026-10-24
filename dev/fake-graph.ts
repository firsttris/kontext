/**
 * A stand-in for Microsoft's sign-in and Graph, just enough for the move from Microsoft 365 in
 * development and tests (no Microsoft account needed). Shapes from the Graph v1.0 docs:
 * mailFolder, message delta, $value, contact, event.
 *
 *   bun dev/fake-graph.ts                 # http://127.0.0.1:18095
 *   bun dev/fake-graph.ts --port 28095    # the e2e tests
 *
 * Tenant "contoso", app "kontext-test" with the secret "geheim"; one mailbox
 * petra@contoso.test with an inbox, a subfolder "Projekte", sent items and deleted items (not
 * moved), a contact and a weekly appointment. The first delta request is throttled once (429).
 */
import { parseArgs } from "node:util";

const { values: args } = parseArgs({ options: { port: { type: "string", default: "18095" } } });
const port = Number(args.port);
const origin = `http://127.0.0.1:${port}`;

export const FAKE_M365 = {
  tenantId: "contoso",
  clientId: "kontext-test",
  clientSecret: "geheim",
  user: "petra@contoso.test",
};

const mime = (id: string, subject: string, day: string) =>
  [
    "From: Kunde <kunde@example.org>",
    `To: ${FAKE_M365.user}`,
    `Subject: ${subject}`,
    `Message-ID: <${id}@contoso.test>`,
    `Date: ${day}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    `${subject} – aus Microsoft 365.`,
    "",
  ].join("\r\n");

type FakeMessage = {
  folder: string;
  subject: string;
  read: boolean;
  flag: boolean;
  categories?: string[];
};
const messages: Record<string, FakeMessage> = {
  m1: {
    folder: "f-inbox",
    subject: "Anfrage Heizung Outlook",
    read: true,
    flag: false,
    categories: ["Rechnung"],
  },
  m2: {
    folder: "f-inbox",
    subject: "Rückfrage Angebot Outlook",
    read: false,
    flag: true,
    categories: ["Großkunde", "Rechnung"],
  },
  m3: { folder: "f-projekte", subject: "Projekt Schule Outlook", read: true, flag: false },
  m4: { folder: "f-sent", subject: "Angebot verschickt Outlook", read: true, flag: false },
  m5: { folder: "f-deleted", subject: "Gelöscht Outlook", read: true, flag: false },
};

const folders = [
  { id: "f-inbox", displayName: "Posteingang", childFolderCount: 1 },
  { id: "f-sent", displayName: "Gesendete Elemente", childFolderCount: 0 },
  { id: "f-deleted", displayName: "Gelöschte Elemente", childFolderCount: 0 },
];
const wellKnown: Record<string, string> = {
  inbox: "f-inbox",
  sentitems: "f-sent",
  deleteditems: "f-deleted",
};

let throttled = false;

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers });
const notFound = () => json({ error: { code: "ErrorItemNotFound", message: "Not found" } }, 404);

const graph = (url: URL, request: Request): Response => {
  if (request.headers.get("authorization") !== "Bearer fake-token") {
    return json({ error: { message: "InvalidAuthenticationToken" } }, 401);
  }
  const path = decodeURIComponent(url.pathname.replace(/^\/v1\.0/, ""));
  if (path === "/users") {
    return json({
      value: [
        {
          id: "u1",
          displayName: "Petra Outlook",
          mail: FAKE_M365.user,
          userPrincipalName: FAKE_M365.user,
        },
      ],
    });
  }
  const user = path.match(/^\/users\/([^/]+)(.*)$/);
  if (!user || user[1] !== FAKE_M365.user) return notFound();
  const rest = user[2] ?? "";
  if (rest === "") return json({ id: "u1" });
  const known = rest.match(/^\/mailFolders\/([a-z]+)$/);
  if (known) return wellKnown[known[1]!] ? json({ id: wellKnown[known[1]!] }) : notFound();
  if (rest === "/mailFolders") return json({ value: folders });
  // Outlook's category list with colours; "Rechnung" is missing, as after a rename in Outlook.
  if (rest === "/outlook/masterCategories") {
    return json({ value: [{ id: "c1", displayName: "Großkunde", color: "preset4" }] });
  }
  if (rest === "/mailFolders/f-inbox/childFolders") {
    return json({ value: [{ id: "f-projekte", displayName: "Projekte", childFolderCount: 0 }] });
  }
  const delta = rest.match(/^\/mailFolders\/([^/]+)\/messages\/delta$/);
  if (delta) {
    if (!throttled) {
      throttled = true;
      return json({ error: { message: "Too many requests" } }, 429, { "retry-after": "1" });
    }
    const folder = delta[1]!;
    if (url.searchParams.get("deltatoken")) {
      return json({ value: [], "@odata.deltaLink": `${url.origin}${url.pathname}?deltatoken=2` });
    }
    const items = Object.entries(messages)
      .filter(([, m]) => m.folder === folder)
      .map(([id, m]) => ({
        id,
        internetMessageId: `<${id}@contoso.test>`,
        isRead: m.read,
        flag: { flagStatus: m.flag ? "flagged" : "notFlagged" },
        categories: m.categories ?? [],
        receivedDateTime: "2026-10-20T07:00:00Z",
      }));
    // Two pages, so the paging is used.
    const page = url.searchParams.get("page");
    const deltaLink = `${url.origin}${url.pathname}?deltatoken=1`;
    if (!page && items.length > 1) {
      return json({
        value: items.slice(0, 1),
        "@odata.nextLink": `${url.origin}${url.pathname}?page=2`,
      });
    }
    return json({ value: page ? items.slice(1) : items, "@odata.deltaLink": deltaLink });
  }
  const value = rest.match(/^\/messages\/([^/]+)\/\$value$/);
  if (value) {
    const message = messages[value[1]!];
    if (!message) return notFound();
    return new Response(mime(value[1]!, message.subject, "Mon, 20 Oct 2026 09:00:00 +0200"), {
      headers: { "content-type": "message/rfc822" },
    });
  }
  if (rest === "/contacts") {
    return json({
      value: [
        {
          givenName: "Olaf",
          surname: "Outlook",
          companyName: "Contoso Bau",
          emailAddresses: [{ address: "olaf@contoso-bau.test", name: "Olaf Outlook" }],
          businessPhones: ["07223 98765"],
        },
      ],
    });
  }
  if (rest === "/events") {
    return json({
      value: [
        {
          iCalUId: "040000008200E00074C5B7101A82E008-fake-1",
          subject: "Wochenbesprechung Outlook",
          body: { contentType: "html", content: "<p>Im Büro</p>" },
          start: { dateTime: "2026-10-26T09:00:00.0000000", timeZone: "W. Europe Standard Time" },
          end: { dateTime: "2026-10-26T10:00:00.0000000", timeZone: "W. Europe Standard Time" },
          isAllDay: false,
          showAs: "busy",
          location: { displayName: "Büro" },
          type: "seriesMaster",
          recurrence: {
            pattern: { type: "weekly", interval: 1, daysOfWeek: ["monday"] },
            range: { type: "noEnd", startDate: "2026-10-26" },
          },
        },
      ],
    });
  }
  return notFound();
};

const token = async (url: URL, request: Request): Promise<Response> => {
  const form = new URLSearchParams(await request.text());
  const tenant = url.pathname.split("/")[1];
  if (
    tenant !== FAKE_M365.tenantId ||
    form.get("client_id") !== FAKE_M365.clientId ||
    form.get("client_secret") !== FAKE_M365.clientSecret
  ) {
    return json(
      {
        error: "invalid_client",
        error_description: "AADSTS7000215: Invalid client secret provided.",
      },
      401,
    );
  }
  return json({ access_token: "fake-token", expires_in: 3600, token_type: "Bearer" });
};

if (import.meta.main) {
  Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch: (request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith("/oauth2/v2.0/token")) return token(url, request);
      if (url.pathname.startsWith("/v1.0/")) return graph(url, request);
      return new Response("ok");
    },
  });
  console.log(`Fake-Microsoft-Graph läuft: ${origin}`);
}
