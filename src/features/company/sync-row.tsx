/** One move from Gmail & Co.: state, numbers, and what can be done with it. */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import { PROVIDERS } from "../../../server/migration/providers";
import { type Company, finishSync, type MailSync, runSync } from "./api";
import { Badge, ConfirmButton } from "./fields";
import { useCompanyChange } from "./queries";
import { PasswordDialog } from "./sync-dialogs";

const STATUS: Record<MailSync["status"], () => string> = {
  active: m.company_sync_status_active,
  running: m.company_sync_status_running,
  "login-failed": m.company_sync_status_login,
  finished: m.company_sync_status_finished,
};

const time = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });

export const SyncRow = ({ sync, company }: { sync: MailSync; company: Company }) => {
  const [dialog, setDialog] = useState<"password" | "finished" | null>(null);
  const run = useCompanyChange(() => runSync(sync.id));
  const finish = useCompanyChange(() => finishSync(sync.id));
  const person = company.employees.find((e) => e.id === sync.accountId);
  const provider = PROVIDERS.find((p) => p.id === sync.provider)?.name ?? sync.host;
  const open = sync.status !== "finished";

  return (
    <li className="flex flex-col gap-2 px-3 py-3 md:px-4" aria-label={sync.login}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-medium">{person?.fullName ?? sync.accountEmail}</span>
        <span className="text-[13px] text-muted">
          {m.company_sync_from({ login: sync.login })} · {provider}
        </span>
        <Badge tone={sync.status === "login-failed" ? "danger" : undefined}>
          {STATUS[sync.status]()}
        </Badge>
      </div>
      <p className="m-0 text-[13px] text-muted">
        {m.company_sync_counts({ imported: sync.counts.imported })}
        {sync.counts.added ? ` · ${m.company_sync_added({ count: sync.counts.added })}` : ""}
        {sync.counts.failed
          ? ` · ${m.company_migration_failed({ count: sync.counts.failed })}`
          : ""}
        {sync.lastRunAt ? ` · ${m.company_sync_last({ time: time(sync.lastRunAt) })}` : ""}
      </p>
      {sync.lastError ? <p className="m-0 text-[13px] text-danger">{sync.lastError}</p> : null}
      {open ? (
        <div className="flex flex-wrap items-start gap-2">
          {sync.status === "active" ? (
            <Button disabled={run.isPending} onClick={() => void run.mutateAsync(undefined)}>
              {m.company_sync_run()}
            </Button>
          ) : null}
          <Button onClick={() => setDialog("password")}>{m.company_sync_new_password()}</Button>
          <ConfirmButton
            label={m.company_sync_finish()}
            question={m.company_sync_finish_confirm()}
            disabled={finish.isPending || sync.status === "running"}
            onConfirm={() => void finish.mutateAsync(undefined).then(() => setDialog("finished"))}
          />
        </div>
      ) : null}
      {dialog === "password" ? (
        <PasswordDialog syncId={sync.id} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "finished" ? (
        <Dialog
          open
          onOpenChange={(next) => !next && setDialog(null)}
          title={m.company_sync_finished_title()}
        >
          <p className="m-0 text-[14px]">
            {m.company_sync_finished_forward({ address: sync.accountEmail })}
          </p>
          <p className="m-0 text-[14px] text-muted">{m.company_sync_finished_domain()}</p>
          <Button variant="primary" className="self-end" onClick={() => setDialog(null)}>
            {m.company_done()}
          </Button>
        </Dialog>
      ) : null}
    </li>
  );
};
