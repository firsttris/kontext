/**
 * The box's own page in the office network (port 8089): is it paired, connected to Kontext,
 * signed in at the Fritzbox – and, before pairing, a form for Kontext's address and the code.
 * Read-only otherwise; everything else is set in Kontext. Pure HTML.
 */
import type { BoxState } from "./run";

const escapeHtml = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const row = (label: string, ok: boolean, text: string) =>
  `<tr><th>${label}</th><td class="${ok ? "ok" : "bad"}">${escapeHtml(text)}</td></tr>`;

const PAGE_STYLE = `body{font:15px system-ui,sans-serif;max-width:520px;margin:40px auto;padding:0 16px;color:#18181b}
h1{font-size:20px}th{text-align:left;font-weight:500;padding:6px 16px 6px 0;color:#52525b}
.ok{color:#15803d}.bad{color:#b91c1c}input{font:inherit;padding:8px;width:100%;box-sizing:border-box;margin:4px 0 12px}
button{font:inherit;padding:8px 14px}@media(prefers-color-scheme:dark){body{background:#09090b;color:#fafafa}th{color:#a1a1aa}}`;

export const statusPage = ({
  version,
  paired,
  kontextUrl,
  state,
  error,
}: {
  version: string;
  paired: boolean;
  kontextUrl: string | null;
  state: BoxState | null;
  error?: string;
}): string => {
  const body = paired
    ? `<table>
${row("Kontext", Boolean(state?.connected), state?.connected ? `verbunden (${kontextUrl})` : `nicht verbunden (${kontextUrl})`)}
${row("Fritzbox", Boolean(state?.registered), state?.registered ? "angemeldet" : state?.detail || "nicht angemeldet")}
${row("Konfiguration", state?.configVersion !== null && !state?.error, state?.error ?? (state?.configVersion ? "übernommen" : "noch keine"))}
</table>`
    : `<p>Die Box ist noch nicht mit Kontext gekoppelt. Den Code gibt es in Kontext unter
Einstellungen → Telefonie → „Box koppeln“.</p>
${error ? `<p class="bad">${escapeHtml(error)}</p>` : ""}
<form method="post" action="/pair">
<label>Adresse von Kontext<input name="url" type="url" required placeholder="https://kontext.firma.de"></label>
<label>Code<input name="code" required placeholder="K7QM-4XPA" autocomplete="off"></label>
<button type="submit">Koppeln</button>
</form>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Kontext-Telefonbox</title><style>${PAGE_STYLE}</style></head>
<body><h1>Kontext-Telefonbox</h1>${body}<p style="color:#71717a;font-size:13px">Version ${escapeHtml(version)}</p></body></html>`;
};
