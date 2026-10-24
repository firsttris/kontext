/** Connecting the old mailbox (Gmail, GMX, …) and entering a new password after a change. */
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { m } from "@/paraglide/messages";
import { PROVIDERS, type ProviderId } from "../../../server/migration/providers";
import { type Company, createSync, setSyncPassword } from "./api";
import { M365Fields } from "./m365-fields";
import { useCompanyChange } from "./queries";

const HINTS: Partial<Record<ProviderId, () => string>> = {
  gmail: m.company_sync_hint_gmail,
  gmx: m.company_sync_hint_gmx,
  webde: m.company_sync_hint_webde,
  "t-online": m.company_sync_hint_tonline,
  other: m.company_sync_hint_other,
};

const Problem = ({ text }: { text: string | null }) =>
  text ? (
    <p role="alert" className="m-0 text-[13px] text-danger">
      {text}
    </p>
  ) : null;

export const ConnectDialog = ({ company, onClose }: { company: Company; onClose: () => void }) => {
  const people = company.employees.filter((e) => e.active);
  const [accountId, setAccountId] = useState(people[0]?.id ?? "");
  const [provider, setProvider] = useState<ProviderId>("gmail");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("993");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const connect = useCompanyChange(createSync);
  const hint = HINTS[provider];

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      await connect.mutateAsync({
        accountId,
        provider,
        ...(provider === "other" ? { host, port: Number(port) } : {}),
        login,
        password,
      });
      onClose();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={m.company_sync_new()}>
      <div className="flex flex-col gap-4">
        <Label>
          {m.company_migration_person()}
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {person.fullName} ({person.email})
              </option>
            ))}
          </Select>
        </Label>
        <Label>
          {m.company_sync_provider()}
          <Select value={provider} onChange={(e) => setProvider(e.target.value as ProviderId)}>
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      {provider === "m365" ? (
        <M365Fields company={company} accountId={accountId} onClose={onClose} />
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {hint ? <p className="m-0 text-[13px] text-muted">{hint()}</p> : null}
          {provider === "other" ? (
            <div className="grid grid-cols-[1fr_96px] gap-3">
              <Label>
                {m.company_sync_host()}
                <Input value={host} onChange={(e) => setHost(e.target.value)} required />
              </Label>
              <Label>
                {m.company_sync_port()}
                <Input
                  inputMode="numeric"
                  value={port}
                  onChange={(e) => setPort(e.target.value.replace(/\D/g, ""))}
                  required
                />
              </Label>
            </div>
          ) : null}
          <Label>
            {m.company_sync_login()}
            <Input
              type="email"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              autoComplete="off"
              required
            />
          </Label>
          <Label>
            {provider === "gmail" ? m.company_sync_password_app() : m.company_sync_password()}
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
            />
          </Label>
          {connect.isPending ? (
            <p role="status" className="m-0 text-[13px] text-muted">
              {m.company_sync_checking()}
            </p>
          ) : null}
          <Problem text={problem} />
          <Button type="submit" variant="primary" className="self-end" disabled={connect.isPending}>
            {m.company_sync_connect()}
          </Button>
        </form>
      )}
    </Dialog>
  );
};

export const PasswordDialog = ({ syncId, onClose }: { syncId: string; onClose: () => void }) => {
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const save = useCompanyChange((value: string) => setSyncPassword(syncId, value));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      await save.mutateAsync(password);
      onClose();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={m.company_sync_new_password()}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label>
          {m.company_sync_password()}
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </Label>
        <Problem text={problem} />
        <Button type="submit" variant="primary" className="self-end" disabled={save.isPending}>
          {m.company_sync_save_password()}
        </Button>
      </form>
    </Dialog>
  );
};
