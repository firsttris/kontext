/**
 * "E-Mails importieren (.eml, .mbox)": mails saved as files go into a folder, picked with the
 * button above the list or dropped onto the list or a folder in the sidebar (mail-drag.ts). An
 * .mbox (Thunderbird, Apple Mail, Google Takeout) is read piece by piece in the browser, so a file
 * of several GB works while the tab stays open. Outlook's .msg is named as not supported.
 */
import { useQueryClient } from "@tanstack/react-query";
import { FileUp } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { useClient } from "@/auth/auth";
import { useToast } from "@/components/ui/toast";
import { type EmlFailure, type EmlFile, importEmlFiles, importMbox } from "@/jmap/eml-import";
import type { Mailbox } from "@/jmap/types";
import { acceptsImport, checkFile, type FileProblem, receivedAtOf } from "@/lib/eml-import";
import { m } from "@/paraglide/messages";

/** The Date header sits in the first lines; more is not read in the browser. */
const HEAD_BYTES = 64 * 1024;
/** A long failure list is cut; the toast would fill the screen. */
const LISTED = 10;
/** A large .mbox takes a while; every so many mails the toast says how far it is. */
const PROGRESS_EVERY = 500;

const PROBLEM_TEXT: Record<FileProblem, () => string> = {
  msg: m.mail_import_problem_msg,
  type: m.mail_import_problem_type,
  empty: m.mail_import_problem_empty,
};

/** The .eml files that can go, with their received time, the .mbox files, and the refused. */
const prepare = async (files: File[]) => {
  const ready: EmlFile[] = [];
  const mboxes: File[] = [];
  const refused: EmlFailure[] = [];
  const now = new Date();
  for (const file of files) {
    const check = checkFile(file);
    if (!check.ok) {
      refused.push({ name: file.name, reason: PROBLEM_TEXT[check.problem]() });
    } else if (check.kind === "mbox") {
      mboxes.push(file);
    } else {
      const head = await file.slice(0, HEAD_BYTES).text();
      ready.push({ name: file.name, data: file, receivedAt: receivedAtOf(head, now) });
    }
  }
  return { ready, mboxes, refused };
};

const failureList = (failed: EmlFailure[]) => {
  const list = failed.slice(0, LISTED).map((item) => `${item.name} (${item.reason})`);
  return [...list, ...(failed.length > LISTED ? [`… +${failed.length - LISTED}`] : [])].join(", ");
};

export type ImportTarget = { accountId: string; mailboxId: string };

/** Imports files into a folder and says how many went in and which did not, and why. */
export const useEmlImport = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();

  return async (target: ImportTarget, files: File[]) => {
    if (!files.length) return;
    const { ready, mboxes, refused } = await prepare(files);
    let imported = 0;
    const failed = refused;
    let shown = 0;
    const progress = (count: number) => {
      if (count - shown < PROGRESS_EVERY) return;
      shown = count;
      toast.show(m.mail_import_progress({ count }));
    };
    if (ready.length || mboxes.length) {
      toast.show(m.mail_import_running());
      try {
        const outcome = await importEmlFiles(client, target.accountId, target.mailboxId, ready);
        imported = outcome.imported;
        failed.push(...outcome.failed);
        for (const file of mboxes) {
          const { accountId, mailboxId } = target;
          const box = await importMbox(client, accountId, mailboxId, file, (count) =>
            progress(imported + count),
          );
          imported += box.imported;
          failed.push(...box.failed);
          if (!box.found)
            failed.push({ name: file.name, reason: m.mail_import_problem_no_mails() });
        }
      } catch (error) {
        toast.show(m.common_error({ message: (error as Error).message }), "error");
        return;
      } finally {
        await queryClient.invalidateQueries({ queryKey: [target.accountId] });
      }
    }
    if (imported) {
      toast.show(
        imported === 1 ? m.mail_import_done_one() : m.mail_import_done({ count: imported }),
      );
    }
    if (failed.length) {
      toast.show(m.mail_import_failed({ list: failureList(failed) }), "error", {
        duration: 12_000,
      });
    }
  };
};

const hasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

/** Props that let files be dropped onto an element; `data-drop-over` while they are over it. */
export const useFileDrop = (onFiles: ((files: File[]) => void) | undefined) => {
  const [over, setOver] = useState(false);
  if (!onFiles) return {};
  return {
    "data-drop-over": over ? "" : undefined,
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setOver(true);
    },
    onDragLeave: (event: DragEvent) => {
      // Moving over a row inside still counts as over the list.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
    },
    onDrop: (event: DragEvent) => {
      setOver(false);
      if (!hasFiles(event)) return;
      event.preventDefault();
      onFiles([...event.dataTransfer.files]);
    },
  };
};

/** The button above a folder's list; nothing for folders that take no imports. */
export const EmlImportButton = ({
  accountId,
  mailbox,
}: {
  accountId: string;
  mailbox: Mailbox;
}) => {
  const input = useRef<HTMLInputElement>(null);
  const run = useEmlImport();
  if (!acceptsImport(mailbox)) return null;
  return (
    <>
      <button
        type="button"
        aria-label={m.mail_import_eml()}
        title={m.mail_import_eml()}
        onClick={() => input.current?.click()}
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
      >
        <FileUp size={15} aria-hidden="true" />
      </button>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        aria-label={m.mail_import_eml()}
        accept=".eml,message/rfc822,.mbox,application/mbox"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          void run({ accountId, mailboxId: mailbox.id }, files);
        }}
      />
    </>
  );
};
