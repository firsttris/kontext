/**
 * Consent for an agent that signs in over OAuth (server/mcp/oauth.ts): which agent asks, what it
 * may do, and the password once more – the connection signs in at Stalwart on its own
 * (server/mcp/oauth-routes.ts). Better Auth's provider sends the browser here with the signed
 * request in the query; allowing or declining sends it back to the agent.
 */
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { signedOAuthQuery } from "@/auth/oauth-query";
import { Button } from "@/components/ui/button";
import {
  CredentialFields,
  type Credentials,
  WriteChoice,
} from "@/features/agents/credential-fields";
import { m } from "@/paraglide/messages";

export const Route = createFileRoute("/agent-consent")({ component: AgentConsentPage });

type PublicClient = { client_name?: string; client_uri?: string; logo_uri?: string };

const usePublicClient = (clientId: string | null) =>
  useQuery({
    queryKey: ["oauth-client", clientId],
    enabled: Boolean(clientId),
    queryFn: async (): Promise<PublicClient | null> => {
      const response = await fetch(
        `/api/auth/oauth2/public-client?client_id=${encodeURIComponent(clientId ?? "")}`,
        { credentials: "same-origin" },
      );
      return response.ok ? ((await response.json()) as PublicClient) : null;
    },
  });

type Answer = { url: string } | { status: "mfa" } | { error: string };

const answer = async (body: Record<string, unknown>): Promise<Answer> => {
  const response = await fetch("/api/mcp-oauth/consent", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json().catch(() => ({}))) as Partial<Answer>;
  if (response.status === 401 && !("error" in result && result.error)) {
    return { error: m.agent_consent_signed_out() };
  }
  return result as Answer;
};

function AgentConsentPage() {
  const oauthQuery = signedOAuthQuery(window.location.search);
  const params = new URLSearchParams(oauthQuery ?? "");
  const clientId = params.get("client_id");
  const asksWrite = (params.get("scope") ?? "").split(" ").includes("write");
  const { data: client } = usePublicClient(clientId);
  const name = client?.client_name || clientId || "";
  const [credentials, setCredentials] = useState<Credentials>({ password: "", code: "" });
  const [write, setWrite] = useState(false);
  const [withCode, setWithCode] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (accept: boolean) => {
    setBusy(true);
    setProblem(null);
    const result = await answer({
      oauth_query: oauthQuery,
      accept,
      write: asksWrite && write,
      ...(accept ? { password: credentials.password } : {}),
      ...(accept && withCode && credentials.code ? { code: credentials.code } : {}),
    }).catch(() => ({ error: m.login_offline() }));
    if ("url" in result) {
      window.location.assign(result.url);
      return;
    }
    setBusy(false);
    if ("status" in result) setWithCode(true);
    else setProblem(result.error);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void send(true);
  };

  return (
    <main className="flex min-h-full items-center justify-center bg-side px-4 py-10">
      <form
        onSubmit={submit}
        className="flex w-full max-w-sm flex-col gap-5 rounded-2xl border border-border bg-bg p-7 shadow-sm"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-9 items-center justify-center rounded-[10px] bg-primary text-[15px] font-semibold text-onprimary"
          >
            K
          </span>
          <span className="text-[17px] font-semibold">{m.app_name()}</span>
        </div>
        {oauthQuery && clientId ? (
          <>
            <div className="flex flex-col gap-1">
              <h1 className="m-0 text-[22px] font-semibold tracking-tight">
                {m.agent_consent_title({ name })}
              </h1>
              {client?.client_uri ? (
                <span className="text-[13px] break-all text-muted">{client.client_uri}</span>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 text-[14px]">
              <span className="font-medium">{m.agent_consent_may()}</span>
              <ul className="m-0 flex flex-col gap-1 pl-5 text-muted">
                <li>{m.agent_consent_read()}</li>
                <li>{m.agent_consent_never()}</li>
              </ul>
            </div>
            {asksWrite ? <WriteChoice checked={write} onChange={setWrite} /> : null}
            <p className="m-0 text-[13px] text-muted">{m.agent_consent_password()}</p>
            <CredentialFields value={credentials} onChange={setCredentials} withCode={withCode} />
            {problem ? (
              <p role="alert" className="m-0 text-[13px] text-danger">
                {problem}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button type="submit" variant="primary" size="lg" disabled={busy} className="flex-1">
                {m.agent_consent_allow()}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="lg"
                disabled={busy}
                onClick={() => void send(false)}
              >
                {m.agent_consent_deny()}
              </Button>
            </div>
          </>
        ) : (
          <p role="alert" className="m-0 text-[14px] text-muted">
            {m.agent_consent_invalid()}
          </p>
        )}
      </form>
    </main>
  );
}
