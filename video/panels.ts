import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The cards beside the app in the film, as HTML for a panel screen (video/screens.ts panelOf):
 * a chat with an AI assistant that works with Kontext over MCP, and what the server holds of a
 * confidential message. Only the look is made up; the tool calls and the cipher text are real.
 */

// Playwright runs the takes under Node, from the repository's root.
const font = (file: string) =>
  readFileSync(join("node_modules", "@fontsource-variable", file)).toString("base64");

const page = (body: string) => `<!doctype html><html lang="de"><head><meta charset="utf-8"><style>
@font-face { font-family: Geist; src: url(data:font/woff2;base64,${font("geist/files/geist-latin-wght-normal.woff2")}); font-weight: 100 900; }
@font-face { font-family: "Geist Mono"; src: url(data:font/woff2;base64,${font("geist-mono/files/geist-mono-latin-wght-normal.woff2")}); font-weight: 100 900; }
* { box-sizing: border-box; }
body { margin: 0; height: 100vh; font: 15px/1.5 Geist, sans-serif; color: #18181b; background: #fafafa; display: flex; flex-direction: column; }
.chat { flex: 1; padding: 22px 22px 0; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
.me { align-self: flex-end; max-width: 85%; padding: 11px 15px; border-radius: 16px 16px 4px 16px; background: #18181b; color: white; }
.bot { display: flex; gap: 10px; align-items: flex-start; }
.avatar { flex: none; width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center; background: linear-gradient(135deg, #60a5fa, #8b5cf6); color: white; font-weight: 700; font-size: 14px; }
.bubble { display: flex; flex-direction: column; gap: 8px; min-width: 0; flex: 1; }
.tool { border: 1px solid #e4e4e7; border-radius: 12px; background: white; overflow: hidden; }
.tool b { display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 13px; font-weight: 600; }
.tool b i { font-style: normal; font-family: "Geist Mono"; font-weight: 500; color: #2563eb; }
.tool b em { margin-left: auto; font-style: normal; font-size: 12px; font-weight: 500; color: #16a34a; }
.tool pre { margin: 0; padding: 8px 12px 10px; border-top: 1px solid #f4f4f5; font: 12px/1.55 "Geist Mono"; color: #52525b; white-space: pre-wrap; }
.answer { padding: 2px 0; }
.input { margin: 16px 22px 22px; padding: 12px 16px; border: 1px solid #d4d4d8; border-radius: 14px; background: white; color: #18181b; min-height: 48px; }
.input:empty::before { content: "Frag deinen Assistenten …"; color: #a1a1aa; }
.caret::after { content: ""; display: inline-block; width: 2px; height: 1.1em; margin-left: 1px; vertical-align: -3px; background: #2563eb; }
.server { padding: 24px; font: 13px/1.6 "Geist Mono"; color: #3f3f46; background: #0c0c0f; height: 100vh; }
.server h2 { margin: 0 0 4px; font: 600 14px Geist; color: #e4e4e7; }
.server p { margin: 0 0 18px; font: 13px Geist; color: #a1a1aa; }
.server .field { color: #71717a; }
.server .value { color: #a5f3fc; word-break: break-all; }
.server .cipher { color: #86efac; white-space: pre-wrap; word-break: break-all; }
</style></head><body>${body}</body></html>`;

const escapeHtml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type ToolCall = { name: string; title: string; result?: string };

export type AgentChat = {
  /** What is in the input field, while it is being typed. */
  typing?: string;
  prompt?: string;
  tools?: ToolCall[];
  answer?: string;
};

export const agentPanel = ({ typing, prompt, tools = [], answer }: AgentChat) =>
  page(`<div class="chat">
  ${prompt ? `<div class="me">${escapeHtml(prompt)}</div>` : ""}
  ${
    tools.length || answer
      ? `<div class="bot"><div class="avatar">✦</div><div class="bubble">
    ${tools
      .map(
        (call) =>
          `<div class="tool"><b>${escapeHtml(call.title)} <i>${call.name}</i>${call.result ? "<em>✓</em>" : ""}</b>${
            call.result ? `<pre>${escapeHtml(call.result)}</pre>` : ""
          }</div>`,
      )
      .join("")}
    ${answer ? `<div class="answer">${escapeHtml(answer)}</div>` : ""}
  </div></div>`
      : ""
  }
</div>
<div class="input${typing !== undefined ? " caret" : ""}">${escapeHtml(typing ?? "")}</div>`);

export const serverPanel = (fields: [string, string][], cipher: string) =>
  page(`<div class="server">
  <h2>Gespeichert auf dem Server</h2>
  <p>Ende-zu-Ende verschlüsselt – lesbar nur für Jonas und Anna.</p>
  ${fields.map(([name, value]) => `<div><span class="field">${name}:</span> <span class="value">${escapeHtml(value)}</span></div>`).join("")}
  <div><span class="field">text:</span></div>
  <div class="cipher">${escapeHtml(cipher)}</div>
</div>`);
