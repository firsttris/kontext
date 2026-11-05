---
description: >-
  Connect AI agents like Claude to Kontext (MCP server): look up customers, mails, appointments
  and tasks, create drafts, appointments (with colleagues), contacts and tasks – never send
  anything outside or delete; sign-in by OAuth or an access key, every change logged.
---

# AI agents (MCP) { #ki-agenten-mcp }

Kontext is an **MCP server** ([Model Context Protocol](https://modelcontextprotocol.io)): an AI
agent like Claude works with the mails, appointments, contacts and tasks of the person who
connected it – with exactly their rights, shared mailboxes and “read only” included.

## What an agent can do { #was-ein-agent-kann }

- **Look things up:** “What happened last with Hoffmann?” – contact, latest mails from all
  mailboxes, appointments before and after, open tasks; search mails with the language of the
  search field (`von:`, `in:info@`, `ist:ungelesen` …), read conversations, list appointments and
  tasks.
- **Create and change**, if you allow it: drafts (also as a reply with a quote), appointments with
  an invitation to colleagues, contacts, tasks.
- **Never outside on its own:** there is no deleting and no mail to anyone outside the company. A
  reply waits in “Drafts” until someone sends it in Kontext. To an appointment, the agent only
  invites colleagues: they get the invitation and the appointment in their calendar as if from
  Kontext; it refuses an address from outside, which you invite yourself in Kontext.
- **Log:** every change is listed with the connection under “Recent changes”; at most 100 changes
  per hour.

## Connecting { #verbinden }

- **Claude (app, desktop, claude.ai):** add `https://kontext.firma.de/mcp` as a connector and sign
  in in the browser (OAuth 2.1); Kontext asks what the agent may do, and for the password.
- **Claude Code, scripts and other clients:** create an access key under *Settings → AI agents*
  and pass it as `Authorization: Bearer kontext_…`.

Every connection has a session of its own and can be disconnected on its own; when an employee is
blocked, their agents are disconnected too. There is nothing to set up on the server
([Installation → AI agents](installation.md#ki-agenten)). The tools in detail:
[Architecture → Agents](architecture.md#agenten-mcp).

## Assistant in the chat { #assistent-im-chat }

It also works without an agent of your own: at the top of the chat is the **Assistant**. You ask
it in words (“What happened lately with Keller Elektro?”, “Write Ms Keller that we’ll come on
Tuesday”); it uses the same tools as a connected agent, with the rights of the person asking, and
on request creates drafts, appointments, contacts and tasks; what it created is listed under its
answer. It, too, sends nothing and deletes nothing.

- **Setting up:** the company needs a Claude API key (console.anthropic.com) as
  `ANTHROPIC_API_KEY` ([Installation → AI agents](installation.md#ki-agenten)). Without it there
  is no assistant.
- **Cost:** Anthropic bills by use; a question with a few lookups usually costs a few cents with the
  default model (Claude Sonnet 5.5).
- **Data:** the question and what the assistant looks up for it (mail text, appointments,
  contacts) go to Anthropic; this is said under the input field. Kontext does not store the
  conversation; it stays in the open tab until you reload it or choose “New conversation”.
