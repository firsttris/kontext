/**
 * What goes with the message being written: photos and files (uploaded at once, so sending is
 * quick) and cards of mails, tasks and contacts.
 */
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import { type Card, type ChatFile, isPhoto, isVoice, MAX_FILES, sameCard } from "@/lib/chat-cards";
import { m } from "@/paraglide/messages";
import { uploadFile } from "./upload";
import { decodeVoiceShape, voiceShapeKey } from "./voice-message";

export type PendingFile = {
  key: string;
  name: string;
  type: string;
  /** A local picture of a photo while it uploads. */
  preview: string | null;
  uploaded: ChatFile | null;
  /** Not shown above the field: a recording, which the recorder bar stands for while it goes up. */
  quiet: boolean;
};

export type Attachments = ReturnType<typeof useAttachments>;

/**
 * Uploads the file; a voice message's waveform is read from the file at hand meanwhile, so the
 * sent message shows it at once instead of flat bars until it has loaded the audio again.
 */
const upload = async (
  queryClient: QueryClient,
  channelId: string,
  file: File,
  seal: ((file: File) => Promise<File>) | undefined,
): Promise<ChatFile> => {
  const voice = isVoice(file.type) && typeof OfflineAudioContext !== "undefined";
  const [uploaded, shape] = await Promise.all([
    uploadFile(channelId, file, { seal }),
    voice
      ? file
          .arrayBuffer()
          .then(decodeVoiceShape)
          .catch(() => null)
      : null,
  ]);
  if (shape) queryClient.setQueryData(voiceShapeKey(uploaded.id), shape);
  return uploaded;
};

/** `seal`: files go encrypted (a confidential channel, src/features/chat/confidential.tsx). */
export const useAttachments = (
  channelId: string,
  { seal }: { seal?: (file: File) => Promise<File> } = {},
) => {
  const toast = useToast();
  const queryClient = useQueryClient();
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
    (picked: FileList | File[], { quiet = false }: { quiet?: boolean } = {}) => {
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
          { key, name: file.name, type: file.type, preview, uploaded: null, quiet },
        ]);
        upload(queryClient, channelId, file, seal).then(
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
    [channelId, files.length, toast, drop, seal, queryClient],
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
