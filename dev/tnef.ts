/**
 * A winmail.dat as old Outlook versions send it ([MS-OXTNEF] 2.1.3): per file attAttachRendData,
 * the 8.3 name in attAttachTitle, the bytes in attAttachData and the long name, MIME type and
 * attach method among the MAPI properties of attAttachment. For the seed and the tests of
 * src/lib/tnef.ts.
 */

export type TnefInput = {
  shortName: string;
  longName?: string;
  type?: string;
  data: Uint8Array;
  /** An Outlook item inside (attach method 5) rather than a file. */
  embedded?: boolean;
  /**
   * The bytes as PidTagAttachDataBinary among the MAPI properties instead of in attAttachData,
   * as some writers do (tnefparse's example MAPI_ATTACH_DATA_OBJ.tnef).
   */
  dataInProperties?: boolean;
};

/** attOemCodepage ([MS-OXTNEF]): the code page of the 8-bit strings. */
export type TnefOptions = { oemCodepage?: number };

const u16 = (value: number) => [value & 0xff, (value >> 8) & 0xff];
const u32 = (value: number) => [...u16(value & 0xffff), ...u16(value >>> 16)];
const pad = (bytes: number[]) => [...bytes, ...new Array((4 - (bytes.length % 4)) % 4).fill(0)];
const ansi = (text: string) => [...[...text].map((char) => char.charCodeAt(0) & 0xff), 0];
const unicode = (text: string) => [...[...text].flatMap((char) => u16(char.charCodeAt(0))), 0, 0];

/** Level, id, size, data and the checksum (the sum of the data bytes, mod 65536). */
const attribute = (level: number, id: number, data: number[]) => [
  level,
  ...u32(id),
  ...u32(data.length),
  ...data,
  ...u16(data.reduce((sum, byte) => (sum + byte) % 65536, 0)),
];

/** A variable-length MAPI property (one value), or a PT_LONG one. */
const stringProperty = (id: number, type: number, data: number[]) => [
  ...u16(type),
  ...u16(id),
  ...u32(1),
  ...u32(data.length),
  ...pad(data),
];
const longProperty = (id: number, value: number) => [...u16(0x0003), ...u16(id), ...u32(value)];

const ATTACHMENT = 0x02;
const MESSAGE = 0x01;

const fileAttributes = (file: TnefInput) => {
  const properties = [
    ...(file.longName ? [stringProperty(0x3707, 0x001f, unicode(file.longName))] : []),
    ...(file.type ? [stringProperty(0x370e, 0x001e, ansi(file.type))] : []),
    longProperty(0x3705, file.embedded ? 5 : 1),
    ...(file.dataInProperties ? [stringProperty(0x3701, 0x0102, [...file.data])] : []),
  ];
  return [
    attribute(ATTACHMENT, 0x00069002, new Array(14).fill(0)),
    attribute(ATTACHMENT, 0x00018010, ansi(file.shortName)),
    ...(file.dataInProperties ? [] : [attribute(ATTACHMENT, 0x0006800f, [...file.data])]),
    attribute(ATTACHMENT, 0x00069005, [...u32(properties.length), ...properties.flat()]),
  ].flat();
};

export const winmailDat = (files: TnefInput[], options: TnefOptions = {}): Uint8Array =>
  new Uint8Array([
    ...u32(0x223e9f78),
    ...u16(0x0001),
    // attTnefVersion, as Outlook writes it first, then attOemCodepage.
    ...attribute(MESSAGE, 0x00089006, u32(0x00010000)),
    ...(options.oemCodepage
      ? attribute(MESSAGE, 0x00069007, [...u32(options.oemCodepage), ...u32(0)])
      : []),
    ...files.flatMap(fileAttributes),
  ]);
