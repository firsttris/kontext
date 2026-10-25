/**
 * Just enough DER (X.690) to read certificate extensions and OCSP answers with their exact bytes
 * (a signature is over them as they came), and to write an OCSP request. Pure.
 */

export type Node = {
  tag: number;
  /** Where the element begins (its tag), where its content begins, where it ends. */
  start: number;
  contentStart: number;
  end: number;
  bytes: Uint8Array;
};

export const read = (bytes: Uint8Array, at = 0): Node => {
  const tag = bytes[at]!;
  let length = bytes[at + 1]!;
  let contentStart = at + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    if (count === 0 || count > 4) throw new Error("DER: Länge");
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[at + 2 + i]!;
    contentStart += count;
  }
  const end = contentStart + length;
  if (end > bytes.length) throw new Error("DER: zu kurz");
  return { tag, start: at, contentStart, end, bytes };
};

export const content = (node: Node) => node.bytes.subarray(node.contentStart, node.end);
export const whole = (node: Node) => node.bytes.subarray(node.start, node.end);

/** The elements inside a constructed one (SEQUENCE, SET, explicit tag). */
export const children = (node: Node): Node[] => {
  const found: Node[] = [];
  for (let at = node.contentStart; at < node.end; ) {
    const child = read(node.bytes, at);
    found.push(child);
    at = child.end;
  }
  return found;
};

/** The one element inside an OCTET STRING or an explicit tag. */
export const inner = (node: Node): Node => read(node.bytes, node.contentStart);

export const oidOf = (node: Node): string => {
  const bytes = content(node);
  const parts = [Math.floor(bytes[0]! / 40), bytes[0]! % 40];
  let value = 0;
  for (const byte of bytes.subarray(1)) {
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) {
      parts.push(value);
      value = 0;
    }
  }
  return parts.join(".");
};

export const TAG = {
  INTEGER: 0x02,
  BIT_STRING: 0x03,
  OCTET_STRING: 0x04,
  NULL: 0x05,
  OID: 0x06,
  SEQUENCE: 0x30,
} as const;

const lengthBytes = (length: number) => {
  if (length < 0x80) return [length];
  const out: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) out.unshift(rest & 0xff);
  return [0x80 | out.length, ...out];
};

export const encode = (tag: number, ...parts: Uint8Array[]): Uint8Array => {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const head = [tag, ...lengthBytes(length)];
  const out = new Uint8Array(head.length + length);
  out.set(head);
  let at = head.length;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

export const encodeOid = (oid: string): Uint8Array => {
  const [first = 0, second = 0, ...rest] = oid.split(".").map(Number);
  const bytes = [first * 40 + second];
  for (const part of rest) {
    const chunk = [part & 0x7f];
    for (let value = Math.floor(part / 128); value > 0; value = Math.floor(value / 128)) {
      chunk.unshift((value & 0x7f) | 0x80);
    }
    bytes.push(...chunk);
  }
  return encode(TAG.OID, new Uint8Array(bytes));
};
