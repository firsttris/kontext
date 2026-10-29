/**
 * Pictures in the text of a mail: picked with the button, pasted or dropped into the text. Each
 * goes up as a blob of the sending account at once and shows from a local URL with its Content-ID
 * (`data-cid`); sending turns them into `cid:` and parts of their own (lib/inline-images.ts,
 * lib/mail-structure.ts). Photos, screenshots and GIFs; an SVG goes as an attachment.
 */
import type { Editor } from "@tiptap/react";
import { ImagePlus } from "lucide-react";
import { useRef, useState } from "react";
import type { JmapClient } from "@/jmap/client";
import type { OutgoingImage } from "@/jmap/mail";
import { newCid, sendableHtml } from "@/lib/inline-images";
import { imageUrl } from "@/lib/safe-blob";
import { m } from "@/paraglide/messages";

/** What goes into the text; anything else is an attachment as before. */
export const PICTURE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export const pictures = (files: FileList | File[] | null | undefined): File[] =>
  Array.from(files ?? []).filter((file) => PICTURE_TYPES.includes(file.type));

export const useComposerImages = ({
  client,
  accountId,
  editor,
  onError,
  onBusy,
}: {
  client: JmapClient;
  accountId: string;
  editor: Editor | null;
  onError: (error: Error) => void;
  /** +1 while one goes up, -1 when it is done: sending waits for them. */
  onBusy: (by: 1 | -1) => void;
}) => {
  const [images, setImages] = useState<OutgoingImage[]>([]);

  const insert = async (files: File[]) => {
    for (const file of files) {
      onBusy(1);
      try {
        const [uploaded, src] = await Promise.all([
          client.upload(accountId, file, file.type),
          imageUrl(file),
        ]);
        if (!src) continue;
        const cid = newCid(crypto.randomUUID().slice(0, 12));
        setImages((current) => [
          ...current,
          { blobId: uploaded.blobId, name: file.name, type: file.type, size: uploaded.size, cid },
        ]);
        editor
          ?.chain()
          .focus()
          .insertContent({ type: "image", attrs: { src, alt: file.name, cid } })
          .run();
      } catch (error) {
        onError(error as Error);
      } finally {
        onBusy(-1);
      }
    }
  };

  /**
   * The HTML to send and the images it still shows (one taken out of the text stays home). A
   * draft keeps them all: a picture taken out may come back (undo, cut and paste), and its blob
   * lives only in the draft, which the next save replaces.
   */
  const outgoing = (html: string, { draft = false } = {}) => {
    const sendable = sendableHtml(html);
    return {
      html: sendable.html,
      images: draft ? images : images.filter(({ cid }) => sendable.cids.includes(cid)),
    };
  };

  return { images, setImages, insert, outgoing };
};

/** The bar's button: pick pictures for the text. */
export const InsertImageButton = ({ onFiles }: { onFiles: (files: File[]) => void }) => {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        title={m.mail_insert_image()}
        aria-label={m.mail_insert_image()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => input.current?.click()}
        className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
      >
        <ImagePlus size={15} strokeWidth={1.9} />
      </button>
      <input
        ref={input}
        type="file"
        accept={PICTURE_TYPES.join(",")}
        multiple
        hidden
        aria-hidden="true"
        tabIndex={-1}
        onChange={(event) => {
          onFiles(pictures(event.target.files));
          event.target.value = "";
        }}
      />
    </>
  );
};
