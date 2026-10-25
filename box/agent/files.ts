/**
 * Files between the box and Kontext (/api/phone/box/files, with the box's token): the sounds the
 * dialplan plays come down once each and stay in the box; messages recorded on the mailbox go up,
 * tried again a few times when Kontext is away for a moment.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Credentials } from "./link";

const RETRY_MS = [2_000, 10_000, 60_000, 300_000];

export const filesUrl = (credentials: Credentials, path: string) =>
  `${credentials.url}/api/phone/box/files${path}`;

const auth = (credentials: Credentials) => ({ authorization: `Bearer ${credentials.token}` });

export const createBoxFiles = ({
  credentials,
  soundDir,
  fetcher = fetch,
  wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
}: {
  credentials: Credentials;
  soundDir: string;
  fetcher?: typeof fetch;
  wait?: (ms: number) => Promise<unknown>;
}) => {
  /** Uploads a message or a fax; true once Kontext has it. */
  const upload = async (
    kind: "voicemail" | "fax",
    call: string,
    bytes: Uint8Array,
  ): Promise<boolean> => {
    const type = kind === "fax" ? "application/pdf" : "audio/wav";
    for (const delay of [0, ...RETRY_MS]) {
      if (delay) await wait(delay);
      const response = await fetcher(
        filesUrl(credentials, `/${kind}/${encodeURIComponent(call)}`),
        {
          method: "PUT",
          headers: { ...auth(credentials), "content-type": type },
          body: new Uint8Array(bytes),
        },
      ).catch(() => null);
      if (response?.ok) return true;
      // Kontext does not want it (unknown call, not a WAV): asking again changes nothing.
      if (response && response.status < 500) return false;
    }
    return false;
  };

  return {
    /** Fetches the sounds the box does not have yet; throws when one cannot be had. */
    syncSounds: async (ids: string[]) => {
      await mkdir(soundDir, { recursive: true });
      for (const id of ids) {
        const path = join(soundDir, `${id}.wav`);
        if (existsSync(path)) continue;
        const response = await fetcher(filesUrl(credentials, `/sounds/${id}`), {
          headers: auth(credentials),
        });
        if (!response.ok) throw new Error(`Ansage ${id}: ${response.status}`);
        await writeFile(path, new Uint8Array(await response.arrayBuffer()));
      }
    },
    uploadVoicemail: (call: string, wav: Uint8Array) => upload("voicemail", call, wav),
    uploadFax: (call: string, pdf: Uint8Array) => upload("fax", call, pdf),
    /** The fax Asterisk received (path without ".tif"), as PDF to Kontext, then removed. */
    sendFax: async (
      call: string,
      fax: string,
      toPdf: (tif: string, pdf: string) => Promise<boolean>,
    ): Promise<boolean> => {
      const tif = `${fax}.tif`;
      const pdf = `${fax}.pdf`;
      if (!existsSync(tif)) return false;
      const converted = await toPdf(tif, pdf).catch(() => false);
      const bytes = converted ? await readFile(pdf).catch(() => null) : null;
      const sent = bytes ? await upload("fax", call, bytes) : false;
      if (sent) await Promise.all([rm(tif, { force: true }), rm(pdf, { force: true })]);
      return sent;
    },
    /** The recording Asterisk left (path without ".wav"), sent up and then removed. */
    sendRecording: async (call: string, recording: string): Promise<boolean> => {
      const path = `${recording}.wav`;
      const wav = await readFile(path).catch(() => null);
      // Less than half a second: the caller hung up at the beep.
      if (!wav || wav.length < 44 + 8000) {
        await rm(path, { force: true });
        return false;
      }
      const sent = await upload("voicemail", call, wav);
      if (sent) await rm(path, { force: true });
      return sent;
    },
  };
};

export type BoxFiles = ReturnType<typeof createBoxFiles>;
