/** Connecting another mailbox (Gmail, GMX, …) and entering a new password after a change. */
import { type FormEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { m } from "@/paraglide/messages";
import type { MailProviderId } from "../../../server/external/providers";
import { PROVIDERS } from "../../../server/migration/providers";
import { changeExternalAccount, createExternalAccount } from "./api";
import { useExternalChange } from "./queries";

const MAIL_PROVIDERS = PROVIDERS.filter((p) => p.id !== "m365");

const HINTS: Partial<Record<MailProviderId, () => string>> = {
  gmail: m.company_sync_hint_gmail,
  gmx: m.company_sync_hint_gmx,
  webde: m.company_sync_hint_webde,
  "t-online": m.company_sync_hint_tonline,
  other: m.external_hint_other,
};

const Problem = ({ text }: { text: string | null }) =>
  text ? (
    <p role="alert" className="m-0 text-[13px] text-danger">
      {text}
    </p>
  ) : null;

const Checking = ({ busy, children }: { busy: boolean; children: ReactNode }) =>
  busy ? (
    <p role="status" className="m-0 text-[13px] text-muted">
      {children}
    </p>
  ) : null;

const digits = (value: string) => value.replace(/\D/g, "");

/** Server and port of one direction, for "Anderer Server". */
const ServerFields = ({
  label,
  host,
  port,
  onHost,
  onPort,
}: {
  label: string;
  host: string;
  port: string;
  onHost: (value: string) => void;
  onPort: (value: string) => void;
}) => (
  <div className="grid grid-cols-[1fr_96px] gap-3">
    <Label>
      {label}
      <Input value={host} onChange={(e) => onHost(e.target.value)} required />
    </Label>
    <Label>
      {m.company_sync_port()}
      <Input
        inputMode="numeric"
        value={port}
        onChange={(e) => onPort(digits(e.target.value))}
        required
      />
    </Label>
  </div>
);

export const ConnectDialog = ({ onClose }: { onClose: () => void }) => {
  const [provider, setProvider] = useState<MailProviderId>("gmail");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [imap, setImap] = useState({ host: "", port: "993" });
  const [smtp, setSmtp] = useState({ host: "", port: "465" });
  const [target, setTarget] = useState<"inbox" | "folder">("inbox");
  const [importExisting, setImportExisting] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const connect = useExternalChange(createExternalAccount);
  const hint = HINTS[provider];
  const other = provider === "other";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setProblem(null);
    try {
      await connect.mutateAsync({
        provider,
        email,
        name,
        password,
        target,
        importExisting,
        ...(other
          ? {
              imapHost: imap.host,
              imapPort: Number(imap.port),
              smtpHost: smtp.host,
              smtpPort: Number(smtp.port),
            }
          : {}),
      });
      onClose();
    } catch (error) {
      setProblem((error as Error).message);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={m.external_add()}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label>
          {m.company_sync_provider()}
          <Select value={provider} onChange={(e) => setProvider(e.target.value as MailProviderId)}>
            {MAIL_PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Label>
        {hint ? <p className="m-0 text-[13px] text-muted">{hint()}</p> : null}
        {other ? (
          <>
            <ServerFields
              label={m.external_imap_host()}
              host={imap.host}
              port={imap.port}
              onHost={(host) => setImap((s) => ({ ...s, host }))}
              onPort={(port) => setImap((s) => ({ ...s, port }))}
            />
            <ServerFields
              label={m.external_smtp_host()}
              host={smtp.host}
              port={smtp.port}
              onHost={(host) => setSmtp((s) => ({ ...s, host }))}
              onPort={(port) => setSmtp((s) => ({ ...s, port }))}
            />
          </>
        ) : null}
        <Label>
          {m.external_email()}
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
        <Label>
          {m.external_name()}
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={m.external_name_hint()}
          />
        </Label>
        <Label>
          {m.external_target()}
          <Select value={target} onChange={(e) => setTarget(e.target.value as "inbox" | "folder")}>
            <option value="inbox">{m.external_target_inbox()}</option>
            <option value="folder">{m.external_target_folder()}</option>
          </Select>
        </Label>
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={importExisting}
            onChange={(e) => setImportExisting(e.target.checked)}
            className="mt-0.5"
          />
          {m.external_import_existing()}
        </label>
        <Checking busy={connect.isPending}>{m.company_sync_checking()}</Checking>
        <Problem text={problem} />
        <Button type="submit" variant="primary" className="self-end" disabled={connect.isPending}>
          {m.external_connect()}
        </Button>
      </form>
    </Dialog>
  );
};

export const PasswordDialog = ({ id, onClose }: { id: string; onClose: () => void }) => {
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const save = useExternalChange((value: string) => changeExternalAccount(id, { password: value }));

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
        <Checking busy={save.isPending}>{m.company_sync_checking()}</Checking>
        <Problem text={problem} />
        <Button type="submit" variant="primary" className="self-end" disabled={save.isPending}>
          {m.company_sync_save_password()}
        </Button>
      </form>
    </Dialog>
  );
};
