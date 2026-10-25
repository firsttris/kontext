/**
 * Choosing in Dokumente: a folder to put something into, or a file to attach. One folder at a
 * time, with the way back above it, as in Schreibzeug.
 */
import { ChevronRight, FileText, Folder, Inbox } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";
import { type DocumentNode, useFolder, useMailboxFolders } from "./queries";

type PickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** "folder": only folders, and the buttons below act on the folder shown; "file": a file is picked. */
  mode: "folder" | "file";
  onFile?: (file: DocumentNode) => void;
  /** The buttons for the folder shown (mode "folder"). */
  actions?: (folderId: string | null) => ReactNode;
  /** Where it opens; the person's own files without. */
  startFolderId?: string | null;
};

type Entry = DocumentNode & { mailbox?: boolean };

/**
 * One folder of Dokumente with the way back above it; mounted with the dialog that shows it, so it
 * starts at the top and reads afresh. Also the "Dokument" tab of the chat's link picker. At the top
 * the shared mailboxes' folders come first.
 */
export const DocumentBrowser = ({
  mode,
  onFile,
  actions,
  onCancel,
  startFolderId = null,
}: Omit<PickerProps, "open" | "onOpenChange" | "title"> & { onCancel: () => void }) => {
  const [folderId, setFolderId] = useState<string | null>(startFolderId);
  const listing = useFolder(folderId);
  const mailboxes = useMailboxFolders().data ?? [];
  const mailboxEntries: Entry[] = folderId
    ? []
    : mailboxes.map((mailbox) => ({
        id: mailbox.folderId,
        kind: "folder",
        name: mailbox.email,
        mailbox: true,
      }));
  const entries: Entry[] = [
    ...mailboxEntries,
    ...(listing.data?.children ?? []).filter((node) => mode === "file" || node.kind === "folder"),
  ];
  const crumbs = [
    { id: null, name: m.documents_mine() },
    ...(listing.data?.path ?? []).map((node) => ({
      id: node.id as string | null,
      name: node.name,
    })),
    ...(listing.data?.folder
      ? [{ id: listing.data.folder.id, name: listing.data.folder.name }]
      : []),
  ];
  return (
    <>
      <nav
        aria-label={m.documents_path()}
        className="flex flex-wrap items-center gap-1 text-[13px]"
      >
        {crumbs.map((crumb, index) => (
          <span key={crumb.id ?? "root"} className="flex items-center gap-1">
            {index > 0 ? <ChevronRight size={13} className="text-muted" /> : null}
            <button
              type="button"
              onClick={() => setFolderId(crumb.id)}
              className="rounded px-1 text-muted hover:bg-hover hover:text-fg"
            >
              {crumb.name}
            </button>
          </span>
        ))}
      </nav>
      <ul
        aria-label={m.documents_content()}
        className="m-0 flex max-h-[50dvh] min-h-[160px] list-none flex-col overflow-y-auto rounded-xl border border-border p-1"
      >
        {listing.isError ? (
          <li role="alert" className="px-3 py-2 text-[13px] text-danger">
            {(listing.error as Error).message}
          </li>
        ) : listing.isPending ? (
          <li className="px-3 py-2 text-[13px] text-muted">{m.common_loading()}</li>
        ) : entries.length === 0 ? (
          <li className="px-3 py-2 text-[13px] text-muted">{m.documents_empty()}</li>
        ) : (
          entries.map((node) => (
            <li key={node.id}>
              <button
                type="button"
                onClick={() => (node.kind === "folder" ? setFolderId(node.id) : onFile?.(node))}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] hover:bg-hover"
              >
                {node.mailbox ? (
                  <Inbox size={15} className="text-muted" />
                ) : node.kind === "folder" ? (
                  <Folder size={15} className="text-muted" />
                ) : (
                  <FileText size={15} className="text-muted" />
                )}
                <span className="truncate">{node.name}</span>
              </button>
            </li>
          ))
        )}
      </ul>
      {mode === "folder" && actions ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {m.documents_cancel()}
          </Button>
          {actions(folderId)}
        </div>
      ) : null}
    </>
  );
};

export const DocumentPicker = ({ open, onOpenChange, title, ...body }: PickerProps) => (
  <Dialog open={open} onOpenChange={onOpenChange} title={title}>
    <DocumentBrowser {...body} onCancel={() => onOpenChange(false)} />
  </Dialog>
);
