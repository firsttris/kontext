/**
 * The part of a file a `Range` header asks for (RFC 9110, section 14). Safari plays audio only from
 * a server that answers byte ranges; one range is enough, as browsers ask for one.
 */

/** Inclusive byte positions. */
export type ByteRange = { start: number; end: number };

/**
 * `null`: no usable range, send the whole file. `"unsatisfiable"`: the range lies past the end
 * (416). Several ranges or other units are answered with the whole file, as the RFC allows.
 */
export const byteRange = (
  header: string | undefined,
  size: number,
): ByteRange | "unsatisfiable" | null => {
  const match = header?.trim().match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;
  const [, from = "", to = ""] = match;
  if (!from && !to) return null;
  if (!from) {
    // "bytes=-500": the last 500 bytes.
    const length = Number(to);
    if (length === 0) return "unsatisfiable";
    return { start: Math.max(0, size - length), end: size - 1 };
  }
  const start = Number(from);
  if (start >= size) return "unsatisfiable";
  const end = to ? Math.min(Number(to), size - 1) : size - 1;
  return end < start ? null : { start, end };
};
