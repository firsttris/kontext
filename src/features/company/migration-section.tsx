/** Moves from Outlook: upload a PST for a person, then watch mails, contacts and appointments. */
import { useQuery } from "@tanstack/react-query";
import { Upload } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { uploadInPieces } from "@/lib/chunked-upload";
import { formatSize } from "@/lib/format";
import { m } from "@/paraglide/messages";
import {
  type Company,
  createMigration,
  listMigrations,
  type Migration,
  retryMigration,
  sendPiece,
} from "./api";
import { Badge } from "./fields";
import { CompanyGate } from "./gate";
import { useCompanyChange } from "./queries";

const MIGRATIONS = ["company", "migrations"];

const STATUS: Record<Migration["status"], () => string> = {
  uploading: m.company_migration_status_uploading,
  queued: m.company_migration_status_queued,
  running: m.company_migration_status_running,
  done: m.company_migration_status_done,
  failed: m.company_migration_status_failed,
};

export const MigrationSection = () => (
  <CompanyGate>{(company) => <Migrations company={company} />}</CompanyGate>
);

const Migrations = ({ company }: { company: Company }) => {
  const [open, setOpen] = useState(false);
  const { data: migrations = [] } = useQuery({
    queryKey: MIGRATIONS,
    queryFn: listMigrations,
    // While a move runs, its progress is asked for every two seconds.
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === "queued" || job.status === "running")
        ? 2000
        : false,
  });

  return (
    <>
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center">
        <p className="m-0 flex-1 text-[13px] text-muted">{m.company_migration_hint()}</p>
        <Button variant="primary" onClick={() => setOpen(true)}>
          <Upload size={15} /> {m.company_migration_new()}
        </Button>
      </div>
      {migrations.length ? (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-xl border border-border p-0">
          {migrations.map((job) => (
            <MigrationRow key={job.id} job={job} company={company} />
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[14px] text-muted">{m.company_migration_none()}</p>
      )}
      {open ? <UploadDialog company={company} onClose={() => setOpen(false)} /> : null}
    </>
  );
};

const CountLine = ({
  label,
  count,
  running,
}: {
  label: string;
  count: Migration["progress"]["mails"];
  /** The bar shows only while the move runs. */
  running: boolean;
}) =>
  count.total ? (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-x-2 text-[13px]">
        <span className="font-medium">{label}</span>
        <span className="text-muted">
          {m.company_migration_count({ imported: count.imported, total: count.total })}
          {count.skipped ? ` · ${m.company_migration_skipped({ count: count.skipped })}` : ""}
          {count.failed ? ` · ${m.company_migration_failed({ count: count.failed })}` : ""}
        </span>
      </div>
      {running ? (
        <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
          <div
            className="h-full bg-fg"
            style={{
              width: `${Math.round(((count.imported + count.skipped + count.failed) / count.total) * 100)}%`,
            }}
          />
        </div>
      ) : null}
    </div>
  ) : null;

const MigrationRow = ({ job, company }: { job: Migration; company: Company }) => {
  const retry = useCompanyChange(() => retryMigration(job.id));
  const person = company.employees.find((e) => e.id === job.accountId);
  const running = job.status === "running";
  return (
    <li className="flex flex-col gap-2.5 px-3 py-3 md:px-4" aria-label={job.fileName}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-medium">{person?.fullName ?? job.accountEmail}</span>
        <span className="text-[13px] text-muted">
          {job.fileName} · {formatSize(job.size)}
        </span>
        <Badge tone={job.status === "failed" ? "danger" : undefined}>{STATUS[job.status]()}</Badge>
      </div>
      <CountLine label={m.company_migration_mails()} count={job.progress.mails} running={running} />
      <CountLine
        label={m.company_migration_contacts()}
        count={job.progress.contacts}
        running={running}
      />
      <CountLine
        label={m.company_migration_events()}
        count={job.progress.events}
        running={running}
      />
      {job.error ? <p className="m-0 text-[13px] text-danger">{job.error}</p> : null}
      {job.status === "failed" ? (
        <Button
          className="self-start"
          disabled={retry.isPending}
          onClick={() => void retry.mutateAsync(undefined)}
        >
          {m.company_migration_retry()}
        </Button>
      ) : null}
    </li>
  );
};

const UploadDialog = ({ company, onClose }: { company: Company; onClose: () => void }) => {
  const people = company.employees.filter((e) => e.active);
  const [accountId, setAccountId] = useState(people[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const start = useCompanyChange(async (chosen: File) => {
    const job = await createMigration({ accountId, fileName: chosen.name, size: chosen.size });
    await uploadInPieces(
      chosen,
      (offset, piece) => sendPiece(job.id, offset, piece),
      (received) => setPercent(Math.floor((received / chosen.size) * 100)),
    );
  });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file) return;
    setProblem(null);
    setPercent(0);
    try {
      await start.mutateAsync(file);
      onClose();
    } catch (error) {
      setProblem((error as Error).message);
      setPercent(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => !next && percent === null && onClose()}
      title={m.company_migration_new()}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
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
          {m.company_migration_file()}
          <Input
            type="file"
            accept=".pst"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="h-auto py-2"
          />
        </Label>
        {percent !== null ? (
          <div className="flex flex-col gap-1.5" role="status">
            <span className="text-[13px]">{m.company_migration_uploading({ percent })}</span>
            <div className="h-1.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full bg-fg" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-[12px] text-muted">{m.company_migration_upload_keep_open()}</span>
          </div>
        ) : null}
        {problem ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {problem}
          </p>
        ) : null}
        <Button
          type="submit"
          variant="primary"
          className="self-end"
          disabled={!file || percent !== null}
        >
          {m.company_migration_start()}
        </Button>
      </form>
    </Dialog>
  );
};
