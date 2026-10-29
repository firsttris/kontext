/**
 * The files inside a winmail.dat (TNEF, application/ms-tnef), which old Outlook versions send
 * instead of attachments: [MS-OXTNEF] 2.1.3. A TNEF stream is a signature and a run of
 * attributes; an attachment begins with attAttachRendData and has its bytes in attAttachData (or
 * in PidTagAttachDataBinary), its short name in attAttachTitle and its long name and type among
 * its MAPI properties (attAttachment). Embedded Outlook items are left out. Pure; a broken stream gives null.
 */

export type TnefFile = { name: string; type: string; data: Uint8Array };

const SIGNATURE = 0x223e9f78;
const LEVEL_ATTACHMENT = 0x02;
const ATT_ATTACH_REND_DATA = 0x00069002;
const ATT_ATTACH_TITLE = 0x00018010;
const ATT_ATTACH_DATA = 0x0006800f;
const ATT_ATTACHMENT = 0x00069005;

/** MAPI property ids ([MS-OXPROPS]) and types ([MS-OXCDATA] 2.11.1). */
const PR_ATTACH_LONG_FILENAME = 0x3707;
const PR_ATTACH_MIME_TAG = 0x370e;
const PR_ATTACH_METHOD = 0x3705;
/** PidTagAttachDataBinary: some writers put the bytes here rather than in attAttachData. */
const PR_ATTACH_DATA_BIN = 0x3701;
const PT_BINARY = 0x0102;
const ATTACH_EMBEDDED_MSG = 5;
const MULTI = 0x1000;
const FIXED_SIZE: Record<number, number> = {
  2: 2, // PT_SHORT
  3: 4, // PT_LONG
  4: 4, // PT_FLOAT
  5: 8, // PT_DOUBLE
  6: 8, // PT_CURRENCY
  7: 8, // PT_APPTIME
  10: 4, // PT_ERROR
  11: 2, // PT_BOOLEAN
  20: 8, // PT_I8
  64: 8, // PT_SYSTIME
  72: 16, // PT_CLSID
};
const PT_STRING8 = 0x001e;
const PT_UNICODE = 0x001f;
const VARIABLE = new Set([PT_STRING8, PT_UNICODE, 0x0102, 0x000d]);

const padded = (size: number) => size + ((4 - (size % 4)) % 4);

/** A reader over the bytes that throws when it would read past their end. */
const reader = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  const need = (size: number) => {
    if (size < 0 || at + size > bytes.length) throw new RangeError("TNEF ends early");
  };
  return {
    done: () => at >= bytes.length,
    u8: () => {
      need(1);
      return view.getUint8(at++);
    },
    u16: () => {
      need(2);
      const value = view.getUint16(at, true);
      at += 2;
      return value;
    },
    u32: () => {
      need(4);
      const value = view.getUint32(at, true);
      at += 4;
      return value;
    },
    bytes: (size: number) => {
      need(size);
      const value = bytes.subarray(at, at + size);
      at += size;
      return value;
    },
    skip: (size: number) => {
      need(size);
      at += size;
    },
  };
};

const latin1 = new TextDecoder("windows-1252");
const utf16 = new TextDecoder("utf-16le");

/** A string without the zero bytes it ends with. */
const text = (data: Uint8Array, type: number) =>
  (type === PT_UNICODE ? utf16 : latin1).decode(data).replace(/\0+$/, "");

type Property = { id: number; type: number; values: (Uint8Array | number)[] };

/** The MAPI properties of an attribute ([MS-OXTNEF] 2.1.3.4). */
const mapiProperties = (data: Uint8Array): Property[] => {
  const read = reader(data);
  const count = read.u32();
  const properties: Property[] = [];
  for (let index = 0; index < count; index++) {
    const fullType = read.u16();
    const id = read.u16();
    if (id >= 0x8000) {
      // A named property: its GUID, then a number or a name.
      read.skip(16);
      if (read.u32() === 0) read.skip(4);
      else read.skip(padded(read.u32()));
    }
    const type = fullType & ~MULTI;
    const multi = (fullType & MULTI) !== 0 || VARIABLE.has(type);
    const times = multi ? read.u32() : 1;
    const values: (Uint8Array | number)[] = [];
    for (let n = 0; n < times; n++) {
      if (VARIABLE.has(type)) {
        const size = read.u32();
        values.push(read.bytes(size));
        read.skip(padded(size) - size);
      } else {
        const size = FIXED_SIZE[type];
        if (size === undefined) throw new RangeError(`unknown MAPI type ${type}`);
        const value = read.bytes(size);
        read.skip(padded(size) - size);
        values.push(
          size === 4 ? new DataView(value.buffer, value.byteOffset).getUint32(0, true) : value,
        );
      }
    }
    properties.push({ id, type, values });
  }
  return properties;
};

type Found = {
  title?: string;
  longName?: string;
  mime?: string;
  data?: Uint8Array;
  embedded?: boolean;
};

const fileOf = (attachment: Found): TnefFile | null =>
  attachment.data && !attachment.embedded
    ? {
        name: attachment.longName || attachment.title || "anhang",
        type: attachment.mime || "application/octet-stream",
        data: attachment.data,
      }
    : null;

export const isTnef = (type: string, name: string | null): boolean =>
  /^application\/(vnd\.)?ms-tnef$/i.test(type) || /^winmail\.dat$/i.test(name ?? "");

export const tnefFiles = (bytes: Uint8Array): TnefFile[] | null => {
  try {
    const read = reader(bytes);
    if (read.u32() !== SIGNATURE) return null;
    read.u16(); // the legacy key
    const attachments: Found[] = [];
    while (!read.done()) {
      const level = read.u8();
      const attribute = read.u32();
      const data = read.bytes(read.u32());
      read.u16(); // the checksum
      if (level !== LEVEL_ATTACHMENT) continue;
      if (attribute === ATT_ATTACH_REND_DATA) attachments.push({});
      const current = attachments.at(-1);
      if (!current) continue;
      if (attribute === ATT_ATTACH_TITLE) current.title = text(data, PT_STRING8);
      if (attribute === ATT_ATTACH_DATA) current.data = data;
      if (attribute === ATT_ATTACHMENT) {
        for (const { id, type, values } of mapiProperties(data)) {
          const [value] = values;
          if (id === PR_ATTACH_LONG_FILENAME && value instanceof Uint8Array) {
            current.longName = text(value, type);
          }
          if (id === PR_ATTACH_MIME_TAG && value instanceof Uint8Array) {
            current.mime = text(value, type);
          }
          if (id === PR_ATTACH_METHOD) current.embedded = value === ATTACH_EMBEDDED_MSG;
          if (id === PR_ATTACH_DATA_BIN && type === PT_BINARY && value instanceof Uint8Array) {
            current.data ??= value;
          }
        }
      }
    }
    return attachments.map(fileOf).filter((file): file is TnefFile => file !== null);
  } catch {
    return null;
  }
};
