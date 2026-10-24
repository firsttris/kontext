/**
 * Sends a large file in pieces, one after another, so a 20 GB Outlook file needs no huge request
 * and a broken connection loses only one piece. The server answers each piece with how much it
 * has; the next piece starts there (also when it has less than we sent).
 */

export const PIECE_SIZE = 8 * 1024 * 1024;

export type SendPiece = (offset: number, piece: Blob) => Promise<{ received: number }>;

export const uploadInPieces = async (
  file: Blob,
  send: SendPiece,
  onProgress: (received: number) => void = () => {},
  start = 0,
): Promise<void> => {
  let offset = start;
  while (offset < file.size) {
    const { received } = await send(offset, file.slice(offset, offset + PIECE_SIZE));
    if (received === offset) throw new Error("Hochladen hängt");
    offset = received;
    onProgress(offset);
  }
};
