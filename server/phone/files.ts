/**
 * Telephony's files next to the database: greetings by their id (`sounds/<id>.wav`), the
 * messages callers left (`voicemail/<call>.wav`) and faxes (`fax/<call>.pdf`). Ids are made here
 * or checked against a pattern, so nothing from outside names a path.
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const SAFE_ID = /^[a-zA-Z0-9-]{1,64}$/;

type Kind = "sounds" | "voicemail" | "fax" | "recordings";
const EXTENSION: Record<Kind, string> = {
  sounds: "wav",
  voicemail: "wav",
  fax: "pdf",
  recordings: "wav",
};

export const createPhoneFiles = (dir: string) => {
  const path = (kind: Kind, id: string) => {
    if (!SAFE_ID.test(id)) throw new Error("Ungültige Datei");
    return join(dir, kind, `${id}.${EXTENSION[kind]}`);
  };
  const save = async (kind: Kind, id: string, bytes: Uint8Array) => {
    await mkdir(join(dir, kind), { recursive: true });
    await writeFile(path(kind, id), bytes);
  };
  const read = async (kind: Kind, id: string): Promise<Uint8Array | null> =>
    SAFE_ID.test(id) ? readFile(path(kind, id)).catch(() => null) : null;

  return {
    saveSound: (id: string, bytes: Uint8Array) => save("sounds", id, bytes),
    readSound: (id: string) => read("sounds", id),
    removeSound: (id: string) => rm(path("sounds", id), { force: true }),
    saveVoicemail: (callId: string, bytes: Uint8Array) => save("voicemail", callId, bytes),
    readVoicemail: (callId: string) => read("voicemail", callId),
    saveFax: (callId: string, bytes: Uint8Array) => save("fax", callId, bytes),
    readFax: (callId: string) => read("fax", callId),
    saveRecording: (callId: string, bytes: Uint8Array) => save("recordings", callId, bytes),
    readRecording: (callId: string) => read("recordings", callId),
  };
};

/** A sound or message for the browser or the box. */
export const wavResponse = (bytes: Uint8Array, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), { headers: { "content-type": "audio/wav", ...headers } });

export type PhoneFiles = ReturnType<typeof createPhoneFiles>;
