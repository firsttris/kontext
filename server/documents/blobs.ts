/**
 * Blobs in Stalwart with the person's own token (RFC 8620 §6.1 upload, §6.2 download), at the
 * paths Stalwart names in its session (`/jmap/upload/{accountId}/`, `/jmap/download/…`).
 */
export const createSessionBlobs = (stalwartUrl: string) => ({
  download: async (token: string, accountId: string, blobId: string): Promise<Blob> => {
    const response = await fetch(
      `${stalwartUrl}/jmap/download/${encodeURIComponent(accountId)}/${encodeURIComponent(blobId)}/blob`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error(`Anhang nicht gefunden (${response.status})`);
    return response.blob();
  },
  upload: async (token: string, accountId: string, file: Blob): Promise<string> => {
    const response = await fetch(`${stalwartUrl}/jmap/upload/${encodeURIComponent(accountId)}/`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (!response.ok) throw new Error(`Hochladen fehlgeschlagen (${response.status})`);
    return ((await response.json()) as { blobId: string }).blobId;
  },
});
