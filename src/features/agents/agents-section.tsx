/**
 * Settings → KI-Agenten: the MCP address (Claude's apps sign in with it over OAuth), making an
 * access key for Claude Code and scripts (shown once), and the connected agents with their
 * rights and what they changed lately, each revocable (server/mcp/).
 */
import { Check, Copy } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { Badge, ConfirmButton } from "@/features/company/fields";
import { useTwoFactor } from "@/features/settings/queries";
import { SettingsCard } from "@/features/settings/settings-page";
import { readingDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import {
  type ConnectionInfo,
  claudeCodeCommand,
  mcpAddress,
  useConnections,
  useCreateKey,
  useRevoke,
} from "./api";
import { CredentialFields, type Credentials, WriteChoice } from "./credential-fields";

/** A value to copy: shown in a code box with a copy button. */
export const CopyField = ({
  label,
  value,
  testId,
}: {
  label: string;
  value: string;
  testId?: string;
}) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(value).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[12px] text-muted">{label}</span>
      <div className="flex items-start gap-2">
        <code
          data-testid={testId}
          className="min-w-0 flex-1 rounded-lg border border-border bg-subtle px-3 py-2 font-mono text-[13px] break-all"
        >
          {value}
        </code>
        <Button
          variant="outline"
          onClick={() => void copy()}
          aria-label={m.agents_copy({ what: label })}
        >
          {copied ? <Check size={15} /> : <Copy size={15} />}
        </Button>
      </div>
    </div>
  );
};

const ConnectCard = () => (
  <SettingsCard title={m.agents_connect()} description={m.agents_hint()}>
    <CopyField label={m.agents_address()} value={mcpAddress(window.location.origin)} />
    <p className="m-0 text-[13px] text-muted">{m.agents_oauth_hint()}</p>
    <p className="m-0 border-t border-border pt-3 text-[12px] text-muted">{m.agents_safety()}</p>
  </SettingsCard>
);

const NewKeyCard = () => {
  const origin = window.location.origin;
  const { data: twoFactor } = useTwoFactor();
  const create = useCreateKey();
  const [name, setName] = useState("");
  const [credentials, setCredentials] = useState<Credentials>({ password: "", code: "" });
  const [write, setWrite] = useState(false);
  const [askCode, setAskCode] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [key, setKey] = useState<string | null>(null);
  const withCode = Boolean(twoFactor) || askCode;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      const result = await create.mutateAsync({
        name: name.trim(),
        password: credentials.password,
        code: withCode && credentials.code ? credentials.code : undefined,
        write,
      });
      if (result.status === "mfa") {
        setAskCode(true);
        return;
      }
      setKey(result.key);
      setName("");
      setCredentials({ password: "", code: "" });
      setWrite(false);
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <SettingsCard title={m.agents_key_title()} description={m.agents_key_hint()}>
      {key ? (
        <div className="flex flex-col gap-3">
          <p role="status" className="m-0 text-[13px] font-medium">
            {m.agents_key_once()}
          </p>
          <CopyField label={m.agents_key()} value={key} testId="mcp-key" />
          <CopyField label={m.agents_claude_code()} value={claudeCodeCommand(origin, key)} />
          <p className="m-0 text-[12px] text-muted">{m.agents_other_clients()}</p>
          <Button variant="outline" className="self-start" onClick={() => setKey(null)}>
            {m.agents_done()}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Label>
            {m.agents_name()}
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={m.agents_name_placeholder()}
              maxLength={60}
              required
            />
          </Label>
          <CredentialFields value={credentials} onChange={setCredentials} withCode={withCode} />
          <WriteChoice checked={write} onChange={setWrite} />
          {problem ? (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {problem}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="self-start"
            disabled={create.isPending}
          >
            {m.agents_create()}
          </Button>
        </form>
      )}
    </SettingsCard>
  );
};

export const AgentConnection = ({ connection }: { connection: ConnectionInfo }) => {
  const revoke = useRevoke();
  const toast = useToast();
  const writes = connection.scopes.includes("write");
  return (
    <li className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-medium">{connection.name}</span>
          <Badge>{connection.kind === "key" ? m.agents_kind_key() : m.agents_kind_oauth()}</Badge>
          <Badge>{writes ? m.agents_scope_write() : m.agents_scope_read()}</Badge>
        </div>
        <span className="text-[12px] text-muted">
          {m.agents_created({ date: readingDate(connection.createdAt) })} ·{" "}
          {connection.lastUsedAt
            ? m.agents_used({ date: readingDate(connection.lastUsedAt) })
            : m.agents_never_used()}
        </span>
      </div>
      {connection.recent.length ? (
        <ul
          aria-label={m.agents_recent({ name: connection.name })}
          className="m-0 flex list-none flex-col gap-1 border-l-2 border-border p-0 pl-3"
        >
          {connection.recent.map((line) => (
            <li key={`${line.at}${line.summary}`} className="text-[12px]">
              <span className="text-muted">{readingDate(line.at)}:</span> {line.summary}
            </li>
          ))}
        </ul>
      ) : null}
      <ConfirmButton
        danger
        label={m.agents_revoke()}
        question={m.agents_revoke_question({ name: connection.name })}
        disabled={revoke.isPending}
        onConfirm={() =>
          revoke.mutate(connection.id, {
            onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
          })
        }
      />
    </li>
  );
};

const ConnectionsCard = () => {
  const { data: connections = [] } = useConnections();
  return (
    <SettingsCard title={m.agents_keys()}>
      {connections.length ? (
        <ul aria-label={m.agents_keys()} className="m-0 flex list-none flex-col gap-3 p-0">
          {connections.map((connection) => (
            <AgentConnection key={connection.id} connection={connection} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.agents_none()}</p>
      )}
    </SettingsCard>
  );
};

export const AgentsSection = () => (
  <>
    <ConnectCard />
    <ConnectionsCard />
    <NewKeyCard />
  </>
);
