import { type Browser, expect, type Page } from "@playwright/test";
import { DEV_PASSWORD } from "../../dev/config";
import { jmapAs } from "../../e2e/helpers";
import { say, ui } from "../language";
import { type AgentChat, agentPanel, type ToolCall } from "../panels";
import { ADDRESS, closeAll, desktopOf, panelOf, READING } from "../screens";
import { startTake } from "../take";

/** A key for the agent, made in the settings as a person does it (e2e/agents.spec.ts). */
const createKey = async (page: Page) => {
  await page.goto("/settings?section=agents");
  await page.getByLabel(ui("agents_name")).fill(say("Assistent", "Assistant"));
  await page.getByLabel(ui("agents_password")).fill(DEV_PASSWORD);
  await page.getByLabel(ui("agents_write")).check();
  await page.getByRole("button", { name: ui("agents_create") }).click();
  return (await page.getByTestId("mcp-key").textContent()) ?? "";
};

/** A tool call over MCP, as the agent makes it; its answer as data. */
const callTool = async (page: Page, key: string, name: string, args: Record<string, unknown>) => {
  const response = await page.context().request.post("/mcp", {
    headers: {
      authorization: `Bearer ${key}`,
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    data: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
  });
  return JSON.parse((await response.json()).result.content[0].text);
};

type Overview = {
  contacts: { name: string; company: string | null }[];
  latestMails: { subject: string; received: string; account: string }[];
  upcomingAppointments: { title: string; start: string }[];
};

/** What the agent got back about the customer, in the few lines the panel has room for. */
const overviewLines = ({ contacts, latestMails, upcomingAppointments }: Overview) =>
  [
    contacts[0] &&
      `👤 ${contacts[0].name}${contacts[0].company ? ` · ${contacts[0].company}` : ""}`,
    ...latestMails.slice(0, 3).map((mail) => `✉  ${mail.subject} · ${mail.account.split("@")[0]}@`),
    ...upcomingAppointments
      .slice(0, 1)
      .map((event) => `📅 ${event.title} · ${event.start.slice(0, 10)}`),
  ]
    .filter(Boolean)
    .join("\n");

/** Kontext's MCP server answers in German (server/mcp/writer.ts); the English film says it in English. */
const draftAnswer = (message: string) =>
  say(
    message,
    message.replace(
      /^Entwurf an (.+) liegt in „Entwürfe“ von (.+)\. Er wird erst gesendet, wenn ihn jemand in Kontext abschickt\.$/,
      "Draft to $1 is in “Drafts” of $2. It is only sent once someone sends it in Kontext.",
    ),
  );

const petrasOffer = async () => {
  const client = jmapAs("jonas");
  const { primaryAccounts } = await client.getSession();
  const accountId = primaryAccounts["urn:ietf:params:jmap:mail"]!;
  const { ids } = await client.call<{ ids: string[] }>("Email/query", {
    accountId,
    filter: { subject: "Angebot Wartungsvertrag 2027" },
  });
  return { accountId, id: ids[0]! };
};

const PROMPT = say(
  "Was war zuletzt mit Petra Keller? Schreib ihr, dass Halle 2 mit rein soll.",
  "What’s the latest with Petra Keller? Tell her hall 2 should be included.",
);

/** The reply the agent leaves in Drafts, and what of it shows that it is there. */
const HALL = say("Halle 2", "hall 2");
const REPLY = say(
  `Hallo Petra,\n\nvielen Dank für das Angebot. Bitte nehmt die Heizungsanlagen in ${HALL} mit auf.\n\nViele Grüße\nJonas`,
  `Hi Petra,\n\nthanks for the offer. Please include the heating systems in ${HALL} as well.\n\nBest regards\nJonas`,
);

/**
 * AI agents: an assistant asks Kontext about a customer and leaves a reply in Drafts; Jonas
 * finds it there. The calls go to Kontext's MCP server for real.
 */
export const recordAgents = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const key = await createKey(page);
  const panel = await panelOf(browser, 500, 820);
  await page.goto("/mail");
  await expect(page.getByRole("list", { name: ui("mail_inbox") })).toBeVisible();
  const take = await startTake("agents", {
    agent: {
      page: panel,
      kind: "panel",
      label: say("KI-Assistent · verbunden mit Kontext", "AI assistant · connected to Kontext"),
    },
    app: { page, kind: "desktop", label: ADDRESS },
  });
  // The upper part of the chat, where the answer grows; close enough to read it.
  const answer = { x: 0, y: 0, width: 500, height: 430 };
  const chat = async (state: AgentChat, seconds: number, note: string, cut = false) => {
    await panel.setContent(agentPanel(state));
    await take.hold("agent", seconds, { note, cut, ...(state.prompt ? { focus: answer } : {}) });
  };
  await take.hold("app", 0);
  const yourData = say(
    "Claude & Co. arbeiten mit deinen Daten",
    "Claude & co. work with your data",
  );
  const rights = say("Über MCP – mit genau deinen Rechten", "Over MCP – with exactly your rights");
  const nothingSent = say(
    "Gesendet wird nichts, bis du es tust",
    "Nothing is sent until you send it",
  );
  await chat({ typing: "" }, 0.6, yourData);
  for (let at = 6; at < PROMPT.length + 6; at += 6) {
    await chat({ typing: PROMPT.slice(0, at) }, 0.07, yourData, true);
  }
  const lookup: ToolCall = {
    name: "customer_overview",
    title: say("Kunde nachschlagen", "Look up customer"),
  };
  await chat({ prompt: PROMPT, tools: [lookup] }, 0.6, rights);
  lookup.result = overviewLines(
    await callTool(page, key, "customer_overview", { query: "Keller" }),
  );
  await chat({ prompt: PROMPT, tools: [lookup] }, 1.6, rights);
  const draft: ToolCall = {
    name: "create_draft",
    title: say("Entwurf anlegen", "Create draft"),
  };
  await chat({ prompt: PROMPT, tools: [lookup, draft] }, 0.5, rights);
  const offer = await petrasOffer();
  const created = await callTool(page, key, "create_draft", {
    accountId: offer.accountId,
    replyToEmailId: offer.id,
    text: REPLY,
  });
  draft.result = draftAnswer(created.message as string);
  await chat(
    {
      prompt: PROMPT,
      tools: [lookup, draft],
      answer: say(
        "Fertig: Die Antwort an Petra liegt in deinen Entwürfen. Senden tust du.",
        "Done: the reply to Petra is in your Drafts. Sending is up to you.",
      ),
    },
    1.4,
    rights,
  );
  await take.click("app", page.getByRole("link", { name: new RegExp(ui("mail_drafts")) }), 1.0, {
    until: () => expect(page.getByRole("list", { name: ui("mail_drafts") })).toBeVisible(),
    focus: null,
    note: nothingSent,
  });
  await take.click(
    "app",
    page
      .getByRole("list", { name: ui("mail_drafts") })
      .getByText("Re: Angebot Wartungsvertrag 2027")
      .first(),
    2.4,
    {
      until: () =>
        expect(page.getByRole("textbox", { name: ui("mail_body_placeholder") })).toContainText(
          HALL,
        ),
      focus: READING,
      note: nothingSent,
    },
  );
  await take.save();
  await closeAll(page, panel);
};
