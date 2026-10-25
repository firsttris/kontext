/**
 * Just enough of CSS Syntax Level 3 to find what a stylesheet would fetch: the input is
 * preprocessed (§3.3), then split into comments, strings, url tokens, functions and idents with
 * their escapes, end of input included (§4.3). Everything else passes as single characters. Each
 * token keeps its source text as written, so a cleaner can replace some and join the rest
 * without changing anything else. Pure.
 */
export type CssToken =
  | { type: "comment" | "whitespace" | "bad-string" | "other"; text: string }
  | { type: "string"; text: string; value: string }
  | { type: "url"; text: string; value: string; bad: boolean }
  | { type: "function" | "ident"; text: string; name: string };

/** The preprocessed input and the position in it; only the consume functions move it. */
type Reader = { css: string; i: number };

/** §3.3: CR, CRLF and form feed become a newline, NUL becomes U+FFFD. */
const preprocess = (css: string) => css.replace(/\r\n|[\r\f]/g, "\n").replaceAll("\0", "�");

const isWhitespace = (char: string) => char === " " || char === "\t" || char === "\n";
const isQuote = (char: string) => char === '"' || char === "'";
const isNameChar = (char: string) => /[\w-]/.test(char) || char.charCodeAt(0) >= 0x80;
const isNonPrintable = (char: string) => {
  const code = char.charCodeAt(0);
  return code <= 8 || code === 0x0b || (code >= 0x0e && code <= 0x1f) || code === 0x7f;
};
/** §4.3.7: zero, a surrogate or beyond Unicode reads as U+FFFD. */
const codePoint = (value: number) =>
  value === 0 || (value >= 0xd800 && value <= 0xdfff) || value > 0x10ffff
    ? "�"
    : String.fromCodePoint(value);

/** The character `offset` ahead, "" at the end of input. */
const at = (reader: Reader, offset = 0) => reader.css[reader.i + offset] ?? "";
/** §4.3.8, at a backslash: an escape unless a newline follows. */
const isEscape = (reader: Reader, offset = 0) =>
  at(reader, offset) === "\\" && at(reader, offset + 1) !== "\n";
const skipWhitespace = (reader: Reader) => {
  while (isWhitespace(at(reader))) reader.i++;
};
const since = (reader: Reader, start: number) => reader.css.slice(start, reader.i);

/** §4.3.7, after the backslash. */
const consumeEscape = (reader: Reader) => {
  const hex = /^[0-9a-f]{1,6}/i.exec(reader.css.slice(reader.i, reader.i + 6))?.[0];
  if (hex) {
    reader.i += hex.length;
    if (isWhitespace(at(reader))) reader.i++;
    return codePoint(Number.parseInt(hex, 16));
  }
  if (at(reader) === "") return "�";
  return reader.css[reader.i++];
};

const consumeName = (reader: Reader) => {
  let name = "";
  while (isNameChar(at(reader)) || isEscape(reader)) {
    const char = reader.css[reader.i++];
    name += char === "\\" ? consumeEscape(reader) : char;
  }
  return name;
};

/** §4.3.5, after the opening quote. A newline ends it as a bad string, the end of input not. */
const consumeString = (reader: Reader, quote: string, start: number): CssToken => {
  let value = "";
  for (;;) {
    const char = at(reader);
    if (char === "" || char === quote) {
      if (char === quote) reader.i++;
      return { type: "string", text: since(reader, start), value };
    }
    if (char === "\n") return { type: "bad-string", text: since(reader, start) };
    reader.i++;
    if (char !== "\\") value += char;
    else if (at(reader) === "\n") reader.i++;
    else if (at(reader) !== "") value += consumeEscape(reader);
  }
};

/** §4.3.14, the rest of a bad url up to `)` or the end. */
const consumeBadUrl = (reader: Reader) => {
  while (at(reader) !== "" && at(reader) !== ")") {
    const escaped = isEscape(reader);
    reader.i++;
    if (escaped) consumeEscape(reader);
  }
  if (at(reader) === ")") reader.i++;
};

/** §4.3.6, after `url(` and its whitespace. A bad url is not fetched. */
const consumeUrl = (reader: Reader, start: number): CssToken => {
  let value = "";
  const done = (bad: boolean) => ({ type: "url" as const, text: since(reader, start), value, bad });
  for (;;) {
    const char = at(reader);
    if (char === ")" || char === "") {
      if (char === ")") reader.i++;
      return done(false);
    }
    if (isWhitespace(char)) {
      skipWhitespace(reader);
      if (at(reader) === ")" || at(reader) === "") continue;
    } else if (isEscape(reader)) {
      reader.i++;
      value += consumeEscape(reader);
      continue;
    } else if (!isQuote(char) && char !== "(" && char !== "\\" && !isNonPrintable(char)) {
      value += char;
      reader.i++;
      continue;
    }
    consumeBadUrl(reader);
    return done(true);
  }
};

/** §4.3.4: `url(` with a bare address is a url token, with a quoted one a function. */
const consumeIdentLike = (reader: Reader, start: number): CssToken => {
  const name = consumeName(reader);
  if (at(reader) !== "(") return { type: "ident", text: since(reader, start), name };
  reader.i++;
  if (name.toLowerCase() !== "url") return { type: "function", text: since(reader, start), name };
  while (isWhitespace(at(reader)) && isWhitespace(at(reader, 1))) reader.i++;
  if (isQuote(at(reader)) || (isWhitespace(at(reader)) && isQuote(at(reader, 1)))) {
    return { type: "function", text: since(reader, start), name };
  }
  skipWhitespace(reader);
  return consumeUrl(reader, start);
};

/** §4.3.1, reduced to the tokens above. */
const consumeToken = (reader: Reader): CssToken => {
  const start = reader.i;
  const char = at(reader);
  if (char === "/" && at(reader, 1) === "*") {
    const end = reader.css.indexOf("*/", start + 2);
    reader.i = end < 0 ? reader.css.length : end + 2;
    return { type: "comment", text: since(reader, start) };
  }
  if (isWhitespace(char)) {
    skipWhitespace(reader);
    return { type: "whitespace", text: since(reader, start) };
  }
  if (isQuote(char)) {
    reader.i++;
    return consumeString(reader, char, start);
  }
  if (isNameChar(char) || isEscape(reader)) return consumeIdentLike(reader, start);
  reader.i++;
  return { type: "other", text: char };
};

/**
 * Where each position of the preprocessed input comes from in the original: preprocessing keeps
 * every character in place except CRLF, which becomes one.
 */
const origins = (input: string) => {
  const origin: number[] = [];
  for (let index = 0; index < input.length; index++) {
    origin.push(index);
    if (input[index] === "\r" && input[index + 1] === "\n") index++;
  }
  origin.push(input.length);
  return origin;
};

/** The tokens of `input`, each with its text as written there (not preprocessed). */
export const tokenizeCss = (input: string): CssToken[] => {
  const reader: Reader = { css: preprocess(input), i: 0 };
  const tokens: CssToken[] = [];
  while (reader.i < reader.css.length) tokens.push(consumeToken(reader));
  const origin = origins(input);
  let position = 0;
  return tokens.map((token) => {
    const from = origin[position] ?? input.length;
    position += token.text.length;
    return { ...token, text: input.slice(from, origin[position] ?? input.length) };
  });
};
