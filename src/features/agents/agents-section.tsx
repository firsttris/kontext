/**
 * Settings → KI-Agenten: the MCP address, making an access key (with the password again; the key
 * is shown once) and the list of keys, each revocable (server/mcp/).
 */
import { Check, Copy } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { ConfirmButton } from "@/features/company/fields";
import { useTwoFactor } from "@/features/settings/queries";
import { SettingsCard } from "@/features/settings/settings-page";
import { readingDate } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { claudeCodeCommand, mcpAddress, useCreateKey, useMcpKeys, useRevokeKey } from "./api";

/** A value to copy: shown in a code box with a copy button. */
const CopyField = ({ label, value, testId }: { label: string; value: string; testId?: string }) => {
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

const NewKeyCard = () => {
  const origin = window.location.origin;
  const { data: twoFactor } = useTwoFactor();
  const create = useCreateKey();
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
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
        password,
        code: withCode && code ? code : undefined,
      });
      if (result.status === "mfa") {
        setAskCode(true);
        return;
      }
      setKey(result.key);
      setName("");
      setPassword("");
      setCode("");
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <SettingsCard title={m.agents_connect()} description={m.agents_hint()}>
      <CopyField label={m.agents_address()} value={mcpAddress(origin)} />
      {key ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
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
          <Label>
            {m.agents_password()}
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Label>
          {withCode ? (
            <Label>
              {m.login_code()}
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                required
              />
            </Label>
          ) : null}
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
      <p className="m-0 border-t border-border pt-3 text-[12px] text-muted">
        {m.agents_read_only()}
      </p>
    </SettingsCard>
  );
};

const KeysCard = () => {
  const { data: keys = [] } = useMcpKeys();
  const revoke = useRevokeKey();
  const toast = useToast();
  return (
    <SettingsCard title={m.agents_keys()}>
      {keys.length ? (
        <ul aria-label={m.agents_keys()} className="m-0 flex list-none flex-col gap-3 p-0">
          {keys.map((key) => (
            <li
              key={key.id}
              className="flex flex-col gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-[14px] font-medium">{key.name}</span>
                <span className="text-[12px] text-muted">
                  {m.agents_created({ date: readingDate(key.createdAt) })} ·{" "}
                  {key.lastUsedAt
                    ? m.agents_used({ date: readingDate(key.lastUsedAt) })
                    : m.agents_never_used()}
                </span>
              </div>
              <ConfirmButton
                danger
                label={m.agents_revoke()}
                question={m.agents_revoke_question({ name: key.name })}
                disabled={revoke.isPending}
                onConfirm={() =>
                  revoke.mutate(key.id, {
                    onError: (error) =>
                      toast.show(m.common_error({ message: error.message }), "error"),
                  })
                }
              />
            </li>
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
    <NewKeyCard />
    <KeysCard />
  </>
);
