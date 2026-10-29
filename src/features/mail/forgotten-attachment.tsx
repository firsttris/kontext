/**
 * "Anhang vergessen?" before sending: the text speaks of an attachment, but none is there. The
 * user attaches a file (and sends with the next click) or sends without.
 */
import { Paperclip } from "lucide-react";
import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { m } from "@/paraglide/messages";

type Props = {
  /** The word in the text that speaks of an attachment; the dialog is open while there is one. */
  word: string | null;
  onAttach: (files: FileList | null) => void;
  onSendAnyway: () => void;
  onClose: () => void;
};

export const ForgottenAttachment = ({ word, onAttach, onSendAnyway, onClose }: Props) => {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={word !== null}
      onOpenChange={(open) => (open ? undefined : onClose())}
      title={m.mail_attachment_forgotten()}
      description={m.mail_attachment_forgotten_hint({ word: word ?? "" })}
    >
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          onAttach(e.target.files);
          onClose();
        }}
      />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onSendAnyway}>
          {m.mail_attachment_send_anyway()}
        </Button>
        <Button variant="primary" autoFocus onClick={() => fileInput.current?.click()}>
          <Paperclip size={15} /> {m.mail_attachment_add()}
        </Button>
      </div>
    </Dialog>
  );
};
