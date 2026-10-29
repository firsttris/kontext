/**
 * A winmail.dat (src/lib/tnef.ts) shown as the files it holds: they are read in the browser and
 * put up as blobs of the account (JMAP upload, RFC 8620 §6.1), so the cards below a mail show,
 * download and save them like any attachment. Until then, and when the file cannot be read or
 * the upload is refused (a mailbox only to read), the winmail.dat itself stays.
 */
import { useQueries } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import type { JmapClient } from "@/jmap/client";
import type { BodyPart } from "@/jmap/types";
import { isTnef, tnefFiles } from "@/lib/tnef";

/** Stalwart keeps an upload no one refers to for a while only; read again after that. */
const KEPT_MS = 30 * 60_000;

const unpack = async (
  client: JmapClient,
  accountId: string,
  part: BodyPart,
): Promise<BodyPart[] | null> => {
  const blob = await client.download(
    accountId,
    part.blobId!,
    part.name ?? "winmail.dat",
    part.type,
  );
  const files = tnefFiles(new Uint8Array(await blob.arrayBuffer()));
  if (!files?.length) return null;
  return Promise.all(
    files.map(async (file) => {
      const uploaded = await client.upload(accountId, new Blob([file.data.slice()]), file.type);
      return {
        partId: null,
        blobId: uploaded.blobId,
        type: file.type,
        name: file.name,
        size: file.data.length,
        cid: null,
        disposition: "attachment",
      };
    }),
  );
};

/** The attachments, a winmail.dat replaced by what it holds. */
export const useUnpackedAttachments = (accountId: string, parts: BodyPart[]): BodyPart[] => {
  const client = useClient();
  const winmails = parts.filter((part) => part.blobId && isTnef(part.type, part.name));
  const unpacked = useQueries({
    queries: winmails.map((part) => ({
      queryKey: [accountId, "winmail", part.blobId],
      queryFn: () => unpack(client, accountId, part),
      staleTime: KEPT_MS,
      gcTime: KEPT_MS,
      retry: false,
    })),
  });
  return parts.flatMap((part) => {
    const index = winmails.indexOf(part);
    return (index >= 0 && unpacked[index]?.data) || [part];
  });
};
