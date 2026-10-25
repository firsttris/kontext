/**
 * Where mail and documents touch: an attachment goes into a folder of Dokumente (and opens there,
 * if wanted), and a document becomes an attachment of the mail being written. Shown only where
 * Kontext signs people in to Schreibzeug; the files go server to server (queries.ts).
 */
import { useNavigate } from "@tanstack/react-router";
import { FolderInput, FolderOpen } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type { OutgoingAttachment } from "@/jmap/mail";
import { m } from "@/paraglide/messages";
import { DocumentPicker } from "./document-picker";
import { attachDocument, saveAttachment, useDocumentsConnected } from "./queries";

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
