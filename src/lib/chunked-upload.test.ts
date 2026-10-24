import { describe, expect, it } from "vitest";
import { PIECE_SIZE, uploadInPieces } from "./chunked-upload";

describe("uploadInPieces", () => {
  it("sends the file piece by piece and reports progress", async () => {
    const file = new Blob([new Uint8Array(PIECE_SIZE * 2 + 5)]);
    const sent: [number, number][] = [];
    const progress: number[] = [];
    await uploadInPieces(
      file,
      async (offset, piece) => {
        sent.push([offset, piece.size]);
        return { received: offset + piece.size };
      },
      (received) => progress.push(received),
    );
    expect(sent).toEqual([
      [0, PIECE_SIZE],
      [PIECE_SIZE, PIECE_SIZE],
      [PIECE_SIZE * 2, 5],
    ]);
    expect(progress.at(-1)).toBe(file.size);
  });

  it("goes on where the server stands", async () => {
    const file = new Blob([new Uint8Array(PIECE_SIZE + 10)]);
    const offsets: number[] = [];
    let first = true;
    await uploadInPieces(file, async (offset, piece) => {
      offsets.push(offset);
      if (first) {
        first = false;
        return { received: 3 };
      }
      return { received: offset + piece.size };
    });
    expect(offsets).toEqual([0, 3, PIECE_SIZE + 3]);
  });

  it("stops when nothing arrives", async () => {
    await expect(uploadInPieces(new Blob(["abc"]), async () => ({ received: 0 }))).rejects.toThrow(
      "hängt",
    );
  });
});
