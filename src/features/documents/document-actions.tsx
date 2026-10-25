/**
 * Where mail and documents touch: an attachment goes into a folder of Dokumente (and opens there,
 * if wanted), and a document becomes an attachment of the mail being written; tasks and
 * appointments link documents. Shown only where
 * Kontext signs people in to Schreibzeug; the files go server to server (queries.ts).
 */
import { useNavigate } from "@tanstack/react-router";
import { FilePlus2, FileText, FolderInput, FolderOpen, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { OutgoingAttachment } from "@/jmap/mail";
import { documentHref, type LinkedDocument } from "@/lib/document-links";
import { m } from "@/paraglide/messages";
import { DocumentPicker } from "./document-picker";
import {
  attachDocument,
  type DocumentNode,
  saveAttachment,
  useDocumentsConnected,
  useMailboxFolders,
} from "./queries";

type Attachment = { blobId: string; name: string; type: string };

/** The button on an attachment card: "In Dokumente ablegen". */
export const SaveToDocuments = ({
  accountId,
  attachment,
}: {
  accountId: string;
  attachment: Attachment;
}) => {
  const connected = useDocumentsConnected();
  const toast = useToast();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // A mail of info@ goes into info@'s folder first.
  const mailboxFolder = useMailboxFolders().data?.find((folder) => folder.accountId === accountId);
  if (!connected) return null;

  const save = async (folderId: string | null, thenOpen: boolean) => {
    setBusy(true);
    try {
      const stored = await saveAttachment({ accountId, ...attachment, folderId });
      setOpen(false);
      toast.show(m.documents_saved({ name: stored.name }));
      if (thenOpen) await navigate({ to: "/documents/$", params: { _splat: `edit/${stored.id}` } });
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  const label = m.documents_save({ name: attachment.name });
  return (
    <>
      <Button
        variant="ghost"
        size="iconSm"
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <FolderInput size={15} strokeWidth={1.75} />
      </Button>
      <DocumentPicker
        open={open}
        onOpenChange={setOpen}
        title={m.documents_save_title()}
        mode="folder"
        startFolderId={mailboxFolder?.folderId ?? null}
        actions={(folderId) => (
          <>
            <Button disabled={busy} onClick={() => void save(folderId, true)}>
              {m.documents_save_open()}
            </Button>
            <Button variant="primary" disabled={busy} onClick={() => void save(folderId, false)}>
              {m.documents_save_here()}
            </Button>
          </>
        )}
      />
    </>
  );
};

/** The composer's button "Aus Dokumente anhängen". */
export const AttachFromDocuments = ({
  accountId,
  onAttached,
  onBusy,
}: {
  accountId: string;
  onAttached: (attachment: OutgoingAttachment) => void;
  /** +1 while a document is fetched, -1 after: sending waits for it. */
  onBusy: (change: 1 | -1) => void;
}) => {
  const connected = useDocumentsConnected();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  if (!connected) return null;

  const attach = async (fileId: string) => {
    setOpen(false);
    onBusy(1);
    try {
      onAttached(await attachDocument({ accountId, fileId }));
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      onBusy(-1);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.documents_attach()}
        title={m.documents_attach()}
        onClick={() => setOpen(true)}
      >
        <FolderOpen size={16} />
      </Button>
      <DocumentPicker
        open={open}
        onOpenChange={setOpen}
        title={m.documents_attach()}
        mode="file"
        onFile={(file) => void attach(file.id)}
      />
    </>
  );
};

/** "Dokument verknüpfen": picks a file for a task or an appointment. */
export const LinkDocument = ({ onPick }: { onPick: (file: DocumentNode) => void }) => {
  const connected = useDocumentsConnected();
  const [open, setOpen] = useState(false);
  if (!connected) return null;
  return (
    <>
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        <FilePlus2 size={14} /> {m.documents_link()}
      </Button>
      <DocumentPicker
        open={open}
        onOpenChange={setOpen}
        title={m.documents_link_title()}
        mode="file"
        onFile={(file) => {
          setOpen(false);
          onPick(file);
        }}
      />
    </>
  );
};

/** The documents of an appointment in its editor: each with a way to take it off, and one more. */
export const EventDocuments = ({
  documents,
  onChange,
}: {
  documents: LinkedDocument[];
  onChange: (documents: LinkedDocument[]) => void;
}) => {
  const connected = useDocumentsConnected();
  if (!connected && documents.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[13px] text-muted">{m.documents_linked()}</span>
      {documents.map((document) => (
        <span
          key={document.id}
          className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-[13px]"
        >
          <FileText size={14} className="shrink-0 text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{document.name}</span>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label={m.documents_remove({ name: document.name })}
            onClick={() => onChange(documents.filter((other) => other.id !== document.id))}
          >
            <X size={14} />
          </Button>
        </span>
      ))}
      <LinkDocument
        onPick={(file) => {
          if (documents.some((other) => other.id === file.id)) return;
          const href = documentHref(window.location.origin, file.id);
          onChange([...documents, { id: file.id, name: file.name, href }]);
        }}
      />
    </div>
  );
};
