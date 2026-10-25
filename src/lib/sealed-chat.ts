/**
 * What a confidential chat message holds once opened (docs/encryption.md, building block 5): its
 * text and, when files go along, their real names and types – the server knows them only as
 * "verschlüsselt". Older messages are the bare text. Pure.
 */
import type { ChatFile } from "./chat-cards";

export type SealedPayload = { text: string; files: ChatFile[] };

const MARK = "kontext-sealed";

export const encodePayload = (text: string, files: ChatFile[]): string =>
  files.length
    ? JSON.stringify({
        [MARK]: 1,
        text,
        files: files.map(({ id, name, type, size }) => ({ id, name, type, size })),
      })
    : text;

export const decodePayload = (plain: string): SealedPayload => {
  if (!plain.startsWith(`{"${MARK}":`)) return { text: plain, files: [] };
  try {
    const parsed = JSON.parse(plain) as { text?: unknown; files?: unknown };
    const files = Array.isArray(parsed.files)
      ? parsed.files.flatMap((file: Partial<ChatFile>) =>
          typeof file?.id === "string" && typeof file.name === "string"
            ? [
                {
                  id: file.id,
                  name: file.name,
                  type: typeof file.type === "string" ? file.type : "application/octet-stream",
                  size: typeof file.size === "number" ? file.size : 0,
                },
              ]
            : [],
        )
      : [];
    return { text: typeof parsed.text === "string" ? parsed.text : "", files };
  } catch {
    return { text: plain, files: [] };
  }
};

/** The real files of a message: only those the server really attached to it. */
export const sealedFiles = (payload: SealedPayload, attached: ChatFile[]): ChatFile[] =>
  payload.files.filter((file) => attached.some((stored) => stored.id === file.id));
