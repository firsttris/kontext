/**
 * A picture for the screenshots, made here as a PNG (RFC 2083): a building site – sky, ground and
 * a shell of a house with windows – so the composer shows something that reads as a photo.
 */
import { deflateSync } from "node:zlib";

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (bytes: Buffer) => {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type: string, data: Buffer) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

type Rgb = [number, number, number];

const colourAt = (x: number, y: number, width: number, height: number): Rgb => {
  const horizon = height * 0.62;
  const house = { left: width * 0.28, right: width * 0.72, top: height * 0.3 };
  const inHouse = x > house.left && x < house.right && y > house.top && y < horizon;
  if (inHouse) {
    const column = Math.floor(((x - house.left) / (house.right - house.left)) * 4);
    const row = Math.floor(((y - house.top) / (horizon - house.top)) * 3);
    const cellX = (((x - house.left) / (house.right - house.left)) * 4) % 1;
    const cellY = (((y - house.top) / (horizon - house.top)) * 3) % 1;
    const window =
      row < 2 && column >= 0 && cellX > 0.3 && cellX < 0.7 && cellY > 0.3 && cellY < 0.75;
    return window ? [60, 70, 82] : [196, 190, 178];
  }
  if (y < horizon) {
    const t = y / horizon;
    return [Math.round(120 + 90 * t), Math.round(170 + 60 * t), Math.round(225 + 20 * t)];
  }
  const t = (y - horizon) / (height - horizon);
  return [Math.round(150 - 40 * t), Math.round(120 - 35 * t), Math.round(84 - 25 * t)];
};

export const buildingSitePng = (width = 480, height = 300): Buffer => {
  const rows = Array.from({ length: height }, (_, y) =>
    Buffer.from([
      0,
      ...Array.from({ length: width }, (_, x) => colourAt(x, y, width, height)).flat(),
    ]),
  );
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};
