/**
 * "Aus Datei übernehmen" in Kalender verwalten: an .ics file (an export from Google, Outlook or
 * Apple) into a calendar the user may write to. Stalwart reads the file (src/jmap/ics-import.ts),
 * the preview shows what is new and what is already there, "Übernehmen" writes the new ones.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Repeat } from "lucide-react";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import {
  accountUids,
  type ImportOutcome,
  importFileEvents,
  parseCalendarFile,
} from "@/jmap/ics-import";
import { eventStartShort } from "@/lib/event-when";
import { type FileEvent, fileEvents, importPlan } from "@/lib/ics-import";
import { m } from "@/paraglide/messages";
import { type CalendarRef, calendarLabel, useCalendarAccountId, useCalendarRefs } from "./queries";

/** More would make the dialog long; the count says the rest. */
const SHOWN = 50;

const fileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

const doneText = ({ imported, skipped }: ImportOutcome) =>
  skipped
    ? m.calendar_import_done_skipped({ count: imported, skipped })
    : m.calendar_import_done({ count: imported });

/** The file as Stalwart reads it (in the user's own account) and the UIDs of the target's. */
const usePreview = (file: File | null, target: CalendarRef | undefined) => {
  const client = useClient();
  const ownAccountId = useCalendarAccountId();
  const parsed = useQuery({
    queryKey: ["ics-import", "file", file ? fileKey(file) : ""],
    queryFn: async () => fileEvents(await parseCalendarFile(client, ownAccountId!, file!)),
    enabled: Boolean(file && ownAccountId),
    retry: false,
    gcTime: 0,
  });
  const known = useQuery({
    queryKey: ["ics-import", "uids", target?.accountId],
    queryFn: () => accountUids(client, target!.accountId),
    enabled: Boolean(file && target),
    gcTime: 0,
  });
  const plan = parsed.data && known.data ? importPlan(parsed.data, known.data) : null;
  return { plan, pending: parsed.isFetching || known.isFetching, unreadable: parsed.isError };
};

const PreviewRow = ({ item, known }: { item: FileEvent; known: boolean }) => (
  <li className="flex min-h-8 items-center gap-2 py-1">
    <span className="flex min-w-0 flex-1 flex-col leading-tight">
      <span className={known ? "truncate text-muted" : "truncate"}>
        {item.title || m.invitation_untitled()}
      </span>
      <span className="truncate text-[12px] text-muted">{eventStartShort(item.when)}</span>
    </span>
    {item.repeats ? (
      <span
        className="flex items-center gap-1 text-[12px] text-muted"
        title={m.calendar_import_repeats()}
      >
        <Repeat size={13} /> {m.calendar_import_repeats()}
      </span>
    ) : null}
    {known ? (
      <span className="rounded-md bg-subtle px-1.5 py-0.5 text-[12px] text-muted">
        {m.calendar_import_known()}
      </span>
    ) : null}
  </li>
);

const Preview = ({ fresh, known }: { fresh: FileEvent[]; known: FileEvent[] }) => {
  const rows = [
    ...fresh.map((item) => ({ item, known: false })),
    ...known.map((item) => ({ item, known: true })),
  ];
  if (!rows.length)
    return <p className="m-0 text-[13px] text-muted">{m.calendar_import_empty()}</p>;
  return (
    <div className="flex flex-col gap-1">
      <p className="m-0 text-[13px] font-medium">
        {m.calendar_import_summary({ fresh: fresh.length, known: known.length })}
      </p>
      <ul
        aria-label={m.calendar_import()}
        className="m-0 flex max-h-64 list-none flex-col overflow-y-auto rounded-lg border border-border px-3 py-1"
      >
        {rows.slice(0, SHOWN).map((row) => (
          <PreviewRow key={row.item.uid} item={row.item} known={row.known} />
        ))}
        {rows.length > SHOWN ? (
          <li className="py-1 text-[12px] text-muted">
            {m.calendar_import_more({ count: rows.length - SHOWN })}
          </li>
        ) : null}
      </ul>
    </div>
  );
};

export const IcsImport = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const writable = useCalendarRefs().calendars.filter((calendar) => calendar.mayWrite);
  const [file, setFile] = useState<File | null>(null);
  const [inputKey, setInputKey] = useState(0);
  const [targetKey, setTargetKey] = useState<string>();
  const target = writable.find((c) => c.key === targetKey) ?? writable[0];
  const { plan, pending, unreadable } = usePreview(file, target);

  const reset = () => {
    setFile(null);
    setInputKey((key) => key + 1);
  };

  const run = useMutation({
    mutationFn: () => importFileEvents(client, target!.accountId, target!.calendar.id, plan!.fresh),
    onSuccess: async (outcome) => {
      toast.show(doneText(outcome));
      if (outcome.failed.length) {
        const reason = outcome.failed[0]!;
        toast.show(m.calendar_import_failed({ count: outcome.failed.length, reason }), "error");
      }
      reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["ics-import"] }),
        queryClient.invalidateQueries({ queryKey: [target!.accountId, "events"] }),
      ]);
    },
    onError: (error: Error) => toast.show(m.common_error({ message: error.message }), "error"),
  });

  if (!writable.length) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[12px] font-medium text-muted">{m.calendar_import()}</h3>
      <p className="m-0 text-[13px] text-muted">{m.calendar_import_hint()}</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Label className="flex-1">
          {m.calendar_import_file()}
          <Input
            key={inputKey}
            type="file"
            aria-label={m.calendar_import_file()}
            accept=".ics,text/calendar"
            className="pt-2 text-[13px]"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
        </Label>
        <Label className="flex-1">
          {m.calendar_import_target()}
          <Select
            aria-label={m.calendar_import_target()}
            value={target?.key}
            onChange={(event) => setTargetKey(event.target.value)}
          >
            {writable.map((calendar) => (
              <option key={calendar.key} value={calendar.key}>
                {calendarLabel(calendar)}
              </option>
            ))}
          </Select>
        </Label>
      </div>
      {!file ? null : unreadable ? (
        <p className="m-0 text-[13px] text-danger">{m.calendar_import_unreadable()}</p>
      ) : pending || !plan ? (
        <p className="m-0 text-[13px] text-muted">{m.calendar_import_reading()}</p>
      ) : (
        <>
          <Preview fresh={plan.fresh} known={plan.known} />
          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => run.mutate()}
              disabled={run.isPending || plan.fresh.length === 0}
            >
              {m.calendar_import_submit()}
            </Button>
          </div>
        </>
      )}
    </section>
  );
};
