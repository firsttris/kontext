/**
 * Settings → Weitere Postfächer: one's Gmail, GMX, … in Kontext – fetched every two minutes,
 * offered as senders in the composer (server/external/).
 */
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge, ConfirmButton } from "@/features/company/fields";
import { SettingsCard } from "@/features/settings/settings-page";
import { m } from "@/paraglide/messages";
import { PROVIDERS } from "../../../server/migration/providers";
import { type ExternalAccount, fetchExternalAccount, removeExternalAccount } from "./api";
import { ConnectDialog, PasswordDialog } from "./external-dialogs";
import { useExternalAccounts, useExternalChange } from "./queries";

const STATUS: Record<ExternalAccount["status"], () => string> = {
  active: m.external_status_active,
  running: m.company_sync_status_running,
  "login-failed": m.company_sync_status_login,
};

const time = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

const AccountRow = ({ account }: { account: ExternalAccount }) => {
  const [password, setPassword] = useState(false);
  const run = useExternalChange(() => fetchExternalAccount(account.id));
  const remove = useExternalChange(() => removeExternalAccount(account.id));
  const provider = PROVIDERS.find((p) => p.id === account.provider)?.name ?? account.imapHost;

  return (
    <li className="flex flex-col gap-2 px-3 py-3 md:px-4" aria-label={account.email}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-medium">{account.email}</span>
        <span className="text-[13px] text-muted">
          {account.name} · {provider}
        </span>
        <Badge tone={account.status === "login-failed" ? "danger" : undefined}>
          {STATUS[account.status]()}
        </Badge>
      </div>
      <p className="m-0 text-[13px] text-muted">
        {m.external_counts({ imported: account.counts.imported })}
        {account.counts.failed
          ? ` · ${m.company_migration_failed({ count: account.counts.failed })}`
          : ""}
        {account.lastRunAt ? ` · ${m.external_last({ time: time(account.lastRunAt) })}` : ""}
      </p>
      {account.lastError ? (
        <p className="m-0 text-[13px] text-danger">{account.lastError}</p>
      ) : null}
      <div className="flex flex-wrap items-start gap-2">
        {account.status === "active" ? (
          <Button disabled={run.isPending} onClick={() => void run.mutateAsync(undefined)}>
            {m.external_run()}
          </Button>
        ) : null}
        <Button onClick={() => setPassword(true)}>{m.company_sync_new_password()}</Button>
        <ConfirmButton
          label={m.external_remove()}
          question={m.external_remove_confirm()}
          disabled={remove.isPending}
          onConfirm={() => void remove.mutateAsync(undefined)}
          danger
        />
      </div>
      {password ? <PasswordDialog id={account.id} onClose={() => setPassword(false)} /> : null}
    </li>
  );
};

export const ExternalSection = () => {
  const { data: accounts } = useExternalAccounts();
  const [adding, setAdding] = useState(false);

  return (
    <SettingsCard title={m.external_title()} description={m.external_hint()}>
      {accounts?.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border p-0">
          {accounts.map((account) => (
            <AccountRow key={account.id} account={account} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.external_empty()}</p>
      )}
      <Button variant="outline" className="self-start" onClick={() => setAdding(true)}>
        <Plus size={15} />
        {m.external_add()}
      </Button>
      <p className="m-0 border-t border-border pt-3 text-[12px] text-muted">
        {m.external_phones()}
      </p>
      {adding ? <ConnectDialog onClose={() => setAdding(false)} /> : null}
    </SettingsCard>
  );
};
