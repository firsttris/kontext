/**
 * Where the composer's files live: in Stalwart (uploaded at once, as usual), or – while the mail
 * is to go encrypted – in the browser until they are encrypted with it (lib/held-files.ts,
 * docs/encryption.md). Files and pictures in the text alike.
 */
import { useRef } from "react";
import type { JmapClient } from "@/jmap/client";
import type { OutgoingAttachment, OutgoingImage } from "@/jmap/mail";
import { withSavedBlob } from "@/lib/draft-blobs";
import { heldId, isHeld, pullIntoBrowser, releaseHeld } from "@/lib/held-files";

type Mail = { accountId: string; attachments: OutgoingAttachment[]; images: OutgoingImage[] };

export const useHeldFiles = (client: JmapClient, accountId: string) => {
  const blobs = useRef(new Map<string, Blob>());

  const keep = (blob: Blob): string => {
    const id = heldId(crypto.randomUUID());
    blobs.current.set(id, blob);
    return id;
  };

  /** A file as an attachment that stays in the browser. */
  const hold = (file: File): OutgoingAttachment => ({
    blobId: keep(file),
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
  });

  /** A new file: kept here while `encrypting`, else uploaded to the sending account. */
  const place = async (file: File, encrypting: boolean): Promise<OutgoingAttachment> => {
    if (encrypting) return hold(file);
    const type = file.type || "application/octet-stream";
    const { blobId, size } = await client.upload(accountId, file, type);
    return { blobId, name: file.name, type, size };
  };

  /** The bytes of a held file, for encrypting; undefined for a file in Stalwart. */
  const blobOf = (blobId: string): Blob | undefined =>
    isHeld(blobId) ? blobs.current.get(blobId) : undefined;

  /**
   * The mail with its held files uploaded, for a draft or an unencrypted send; `map` tells the
   * composer's state the new blobIds.
   */
  const release = async <T extends Mail>(mail: T) => {
    const map = await releaseHeld([...mail.attachments, ...mail.images], async (id) => {
      const blob = blobs.current.get(id);
      if (!blob) throw new Error(`Datei fehlt: ${id}`);
      return (await client.upload(mail.accountId, blob, blob.type || "application/octet-stream"))
        .blobId;
    });
    return {
      map,
      mail: {
        ...mail,
        attachments: mail.attachments.map(withSavedBlob(map)),
        images: mail.images.map(withSavedBlob(map)),
      },
    };
  };

  /** Files already in Stalwart into the browser (encrypting switched on): old → new blobId. */
  const pull = (files: OutgoingAttachment[]) =>
    pullIntoBrowser(files, async (blobId) => {
      const file = files.find((candidate) => candidate.blobId === blobId)!;
      return keep(await client.download(accountId, blobId, file.name, file.type));
    });

  return { hold, place, blobOf, release, pull };
};

export type HeldFiles = ReturnType<typeof useHeldFiles>;
