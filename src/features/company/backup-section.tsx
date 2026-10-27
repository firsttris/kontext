/**
 * The Datensicherung in the Firmenverwaltung: where it goes, how the last run went, how full the
 * storage is, the time of the nightly run and "Jetzt sichern". Kontext only writes wishes into
 * its volume; the host's units run the backup and report back (server/company/backup.ts).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, CircleAlert, CircleCheck, Info, LoaderCircle } from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/components/ui/toast";
import { dayAndTime, duration, storage } from "@/lib/backup";
import { cn } from "@/lib/cn";
import { formatSize } from "@/lib/format";
import { m } from "@/paraglide/messages";
import { TIME } from "../../../server/company/backup-schema";
import {
  type BackupSettings,
  type BackupView,
  getBackup,
  runBackup,
  saveBackupSettings,
} from "./api";

const KEY = ["company", "backup"];
const GUIDE = "https://firsttris.github.io/kontext/installation.html#5-backups";

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:gap-4">
    <dt className="w-28 shrink-0 text-[13px] text-muted">{label}</dt>
    <dd className="m-0 min-w-0 flex-1 text-[14px]">{children}</dd>
  </div>
);

const LastRun = ({ view, now }: { view: BackupView; now: Date }) => {
  const running = view.status?.state === "running";
  if (running || view.requested) {
    return (
      <span className="flex items-center gap-1.5">
        <LoaderCircle size={15} className="animate-spin text-muted" />
        {running ? m.backup_running() : m.backup_requested()}
      </span>
    );
  }
  const last = view.status?.lastRun;
  if (!last) return <span className="text-muted">{m.backup_never()}</span>;
  const Icon = last.ok ? CircleCheck : CircleAlert;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="flex items-center gap-1.5">
        <Icon size={15} className={last.ok ? "text-ok" : "text-danger"} />
        {[
          dayAndTime(last.start, now),
          last.ok ? m.backup_ok() : m.backup_failed(),
          last.end ? duration(last.start, last.end) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </span>
      {!last.ok && last.message ? (
        <span className="font-mono text-[12px] break-words text-danger">{last.message}</span>
      ) : null}
    </span>
  );
};

const Storage = ({ sizeBytes, warnGb }: { sizeBytes: number | null; warnGb: number }) => {
  if (sizeBytes === null) return <span className="text-muted">{m.backup_storage_unknown()}</span>;
  const { limitBytes, share, over } = storage(sizeBytes, warnGb);
  return (
    <span className="flex flex-col gap-1.5">
      <span>
        {m.backup_storage_of({ size: formatSize(sizeBytes), limit: formatSize(limitBytes) })}
      </span>
      <span
        aria-hidden="true"
        className="h-1.5 w-full max-w-[240px] overflow-hidden rounded-full bg-subtle"
      >
        <span
          className={cn("block h-full rounded-full", over ? "bg-warn" : "bg-primary")}
          style={{ width: `${Math.max(share * 100, sizeBytes > 0 ? 1 : 0)}%` }}
        />
      </span>
      {over ? (
        <span className="text-[13px] text-warn">{m.backup_storage_over({ gb: warnGb })}</span>
      ) : null}
    </span>
  );
};

const Schedule = ({ view, now }: { view: BackupView; now: Date }) => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [time, setTime] = useState(view.settings.time);
  useEffect(() => setTime(view.settings.time), [view.settings.time]);
  const save = useMutation({
    mutationFn: saveBackupSettings,
    onSuccess: () => toast.show(m.company_saved()),
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const change = (settings: BackupSettings) => {
    if (TIME.test(settings.time)) save.mutate(settings);
  };
  const { enabled } = view.settings;
  const next = view.status?.nextRun;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <Switch
          checked={enabled}
          label={m.backup_automatic()}
          disabled={save.isPending}
          onChange={(on) => change({ enabled: on, time })}
        />
        <span className="text-[14px]">{m.backup_automatic_at()}</span>
        <Input
          type="time"
          aria-label={m.backup_time()}
          value={time}
          disabled={!enabled || save.isPending}
          onChange={(event) => setTime(event.target.value)}
          onBlur={() => time !== view.settings.time && change({ enabled, time })}
          className="w-[7.5rem]"
        />
      </div>
      <span className="text-[13px] text-muted">
        {!enabled ? m.backup_off() : next ? m.backup_next({ when: dayAndTime(next, now) }) : null}
      </span>
    </div>
  );
};

const HostNotice = ({ host }: { host: BackupView["host"] }) =>
  host === "ready" ? null : (
    <p className="m-0 flex items-start gap-2 rounded-lg border border-border px-3 py-2.5 text-[13px]">
      <CircleAlert size={16} className="mt-px shrink-0 text-warn" />
      <span>
        {host === "missing" ? m.backup_missing() : m.backup_stale()}{" "}
        <a href={GUIDE} target="_blank" rel="noreferrer">
          {m.backup_setup()}
        </a>
      </span>
    </p>
  );

export const BackupSection = () => {
  const toast = useToast();
  const queryClient = useQueryClient();
  const { data: view } = useQuery({
    queryKey: KEY,
    queryFn: getBackup,
    // While a run is asked for or runs, a look every few seconds until it is done.
    refetchInterval: (query) =>
      query.state.data?.requested || query.state.data?.status?.state === "running" ? 3000 : false,
  });
  const run = useMutation({
    mutationFn: runBackup,
    onSuccess: () => toast.show(m.backup_started()),
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
  });
  if (!view) return null;
  const now = new Date();
  const status = view.status;
  const busy = view.requested || status?.state === "running";
  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <p className="m-0 text-[13px] text-muted">{m.backup_hint()}</p>
      <HostNotice host={view.host} />
      {status ? (
        <>
          <dl className="m-0 flex flex-col divide-y divide-border">
            <Row label={m.backup_target()}>{status.target || "–"}</Row>
            <Row label={m.backup_last()}>
              <LastRun view={view} now={now} />
            </Row>
            <Row label={m.backup_storage()}>
              <Storage sizeBytes={status.sizeBytes} warnGb={status.warnGb} />
            </Row>
          </dl>
          <Schedule view={view} now={now} />
          <div className="flex flex-col gap-2">
            <div>
              <Button disabled={busy || run.isPending} onClick={() => run.mutate()}>
                {busy ? <LoaderCircle size={14} className="animate-spin" /> : null}
                {m.backup_run()}
              </Button>
            </div>
            <p className="m-0 flex items-start gap-2 text-[13px] text-muted">
              <Info size={15} className="mt-px shrink-0" />
              {m.backup_pause()}
            </p>
          </div>
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-[14px] font-medium">
              <ChevronRight size={16} className="transition-transform group-open:rotate-90" />
              {m.backup_log()}
            </summary>
            {view.log ? (
              <pre className="mt-2 max-h-[360px] overflow-auto rounded-lg border border-border bg-subtle p-3 font-mono text-[12px] leading-relaxed whitespace-pre-wrap">
                {view.log}
              </pre>
            ) : (
              <p className="m-0 mt-2 text-[13px] text-muted">{m.backup_log_empty()}</p>
            )}
          </details>
        </>
      ) : null}
    </div>
  );
};
