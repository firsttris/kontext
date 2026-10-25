/**
 * What goes with the message being written: photos and files (uploaded at once, so sending is
 * quick) and cards of mails, tasks and contacts.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { type Card, type ChatFile, isPhoto, MAX_FILES, sameCard } from "@/lib/chat-cards";
import { m } from "@/paraglide/messages";
import { uploadFile } from "./upload";

export type PendingFile = {
  key: string;
  name: string;
  type: string;
  /** A local picture of a photo while it uploads. */
  preview: string | null;
  uploaded: ChatFile | null;
};

export type Attachments = ReturnType<typeof useAttachments>;

/** `seal`: files go encrypted (a confidential channel, src/features/chat/confidential.tsx). */
export const useAttachments = (
  channelId: string,
  { seal }: { seal?: (file: File) => Promise<File> } = {},
) => {
  const toast = useToast();
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const previews = useRef(new Set<string>());

  // Free the local pictures when the conversation closes.
  useEffect(
    () => () => {
      for (const url of previews.current) URL.revokeObjectURL(url);
    },
    [],
  );

  const drop = useCallback((key: string) => {
    setFiles((current) => {
      const gone = current.find((file) => file.key === key);
      if (gone?.preview) {
        URL.revokeObjectURL(gone.preview);
        previews.current.delete(gone.preview);
      }
      return current.filter((file) => file.key !== key);
    });
  }, []);

  const addFiles = useCallback(
    (picked: FileList | File[]) => {
      const room = MAX_FILES - files.length;
      const chosen = Array.from(picked).slice(0, Math.max(0, room));
      if (picked.length > chosen.length)
        toast.show(m.chat_too_many_files({ max: MAX_FILES }), "error");
      for (const file of chosen) {
        const key = crypto.randomUUID();
        const preview = isPhoto(file.type) ? URL.createObjectURL(file) : null;
        if (preview) previews.current.add(preview);
        setFiles((current) => [
          ...current,
          { key, name: file.name, type: file.type, preview, uploaded: null },
        ]);
        uploadFile(channelId, file, { seal }).then(
          (uploaded) =>
            setFiles((current) =>
              current.map((item) => (item.key === key ? { ...item, uploaded } : item)),
            ),
          (error: Error) => {
            toast.show(m.common_error({ message: error.message }), "error");
            drop(key);
          },
        );
      }
    },
    [channelId, files.length, toast, drop, seal],
  );

  const addCard = useCallback(
    (card: Card) =>
      setCards((current) =>
        current.some((c) => sameCard(c, card)) ? current : [...current, card],
      ),
    [],
  );

  const clear = useCallback(() => {
    for (const url of previews.current) URL.revokeObjectURL(url);
    previews.current.clear();
    setFiles([]);
    setCards([]);
  }, []);

  return {
    files,
    cards,
    addFiles,
    addCard,
    removeFile: drop,
    removeCard: (card: Card) => setCards((current) => current.filter((c) => !sameCard(c, card))),
    clear,
    uploading: files.some((file) => !file.uploaded),
    empty: files.length === 0 && cards.length === 0,
    fileIds: files.flatMap((file) => (file.uploaded ? [file.uploaded.id] : [])),
  };
};
