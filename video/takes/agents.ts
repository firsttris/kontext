import { type Browser, expect, type Page } from "@playwright/test";
import { DEV_PASSWORD } from "../../dev/config";
import { jmapAs } from "../../e2e/helpers";
import { type AgentChat, agentPanel, type ToolCall } from "../panels";
import { ADDRESS, closeAll, desktopOf, panelOf, READING } from "../screens";
import { startTake } from "../take";

/** A key for the agent, made in the settings as a person does it (e2e/agents.spec.ts). */
const createKey = async (page: Page) => {
  await page.goto("/settings?section=agents");
  await page.getByLabel("Name des Agenten").fill("Assistent");
  await page.getByLabel("Dein Passwort").fill(DEV_PASSWORD);
  await page.getByLabel("Darf anlegen und ändern").check();
  await page.getByRole("button", { name: "Schlüssel anlegen" }).click();
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

const PROMPT = "Was war zuletzt mit Petra Keller? Schreib ihr, dass Halle 2 mit rein soll.";

/**
 * AI agents: an assistant asks Kontext about a customer and leaves a reply in Drafts; Jonas
 * finds it there. The calls go to Kontext's MCP server for real.
 */
export const recordAgents = async (browser: Browser) => {
  const page = await desktopOf(browser);
  const key = await createKey(page);
  const panel = await panelOf(browser, 500, 820);
  await page.goto("/mail");
  await expect(page.getByRole("list", { name: "Posteingang" })).toBeVisible();
  const take = await startTake("agents", {
    agent: { page: panel, kind: "panel", label: "KI-Assistent · verbunden mit Kontext" },
    app: { page, kind: "desktop", label: ADDRESS },
  });
  // The upper part of the chat, where the answer grows; close enough to read it.
  const answer = { x: 0, y: 0, width: 500, height: 430 };
  const chat = async (state: AgentChat, seconds: number, note: string, cut = false) => {
    await panel.setContent(agentPanel(state));
    await take.hold("agent", seconds, { note, cut, ...(state.prompt ? { focus: answer } : {}) });
  };
  await take.hold("app", 0);
  await chat({ typing: "" }, 0.6, "Claude & Co. arbeiten mit deinen Daten");
  for (let at = 6; at < PROMPT.length + 6; at += 6) {
    await chat(
      { typing: PROMPT.slice(0, at) },
      0.07,
      "Claude & Co. arbeiten mit deinen Daten",
      true,
    );
  }
  const lookup: ToolCall = { name: "customer_overview", title: "Kunde nachschlagen" };
  await chat({ prompt: PROMPT, tools: [lookup] }, 0.6, "Über MCP – mit genau deinen Rechten");
  lookup.result = overviewLines(
    await callTool(page, key, "customer_overview", { query: "Keller" }),
  );
  await chat({ prompt: PROMPT, tools: [lookup] }, 1.6, "Über MCP – mit genau deinen Rechten");
  const draft: ToolCall = { name: "create_draft", title: "Entwurf anlegen" };
  await chat(
    { prompt: PROMPT, tools: [lookup, draft] },
    0.5,
    "Über MCP – mit genau deinen Rechten",
  );
  const offer = await petrasOffer();
  const created = await callTool(page, key, "create_draft", {
    accountId: offer.accountId,
    replyToEmailId: offer.id,
    text: "Hallo Petra,\n\nvielen Dank für das Angebot. Bitte nehmt die Heizungsanlagen in Halle 2 mit auf.\n\nViele Grüße\nJonas",
  });
  draft.result = created.message as string;
  await chat(
    {
      prompt: PROMPT,
      tools: [lookup, draft],
      answer: "Fertig: Die Antwort an Petra liegt in deinen Entwürfen. Senden tust du.",
    },
    1.4,
    "Über MCP – mit genau deinen Rechten",
  );
  await take.click("app", page.getByRole("link", { name: /Entwürfe/ }), 1.0, {
    until: () => expect(page.getByRole("list", { name: "Entwürfe" })).toBeVisible(),
    focus: null,
    note: "Gesendet wird nichts, bis du es tust",
  });
  await take.click(
    "app",
    page
      .getByRole("list", { name: "Entwürfe" })
      .getByText("Re: Angebot Wartungsvertrag 2027")
      .first(),
    2.4,
    {
      until: () =>
        expect(page.getByRole("textbox", { name: "Ihre Nachricht …" })).toContainText("Halle 2"),
      focus: READING,
      note: "Gesendet wird nichts, bis du es tust",
    },
  );
  await take.save();
  await closeAll(page, panel);
};
