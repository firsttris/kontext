/**
 * CSS from a foreign mail (`style` and other attributes, `<style>`): the addresses it would fetch.
 * While remote content is blocked they go and are counted; inline images (`data:`, `cid:`) stay.
 * Read as the browser reads it (css-tokens.ts), so comments and escapes hide nothing. Pure.
 */
import { type CssToken, tokenizeCss } from "./css-tokens";

/**
 * A URL as the URL parser reads it (WHATWG URL, basic URL parser): tabs and newlines go wherever
 * they are, C0 controls and spaces at both ends.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: the URL parser strips exactly these.
const C0_AT_ENDS = /^[\u0000- ]+|[\u0000- ]+$/g;
const parsedUrl = (url: string) => url.replace(/[\t\n\r]/g, "").replace(C0_AT_ENDS, "");

const isRemote = (url: string) => /^(https?:|[\\/]{2})/i.test(url);
/** Inside the mail: images and fonts in `data:` (a `data:` stylesheet comes only by `@import`). */
const isInline = (url: string) => /^(data:|blob:|#)/i.test(url) || url === "";
/** Fetched if loaded: a remote address, or a relative one (it resolves against the app). */
const isFetched = (url: string) => isRemote(url) || !/^[a-z][a-z0-9+.-]*:/i.test(url);

/**
 * `rules`: a stylesheet (`<style>`), where `@import` can stand; an attribute holds only values.
 */
type Options = { allowRemote: boolean; cidUrls: Record<string, string>; rules?: boolean };

/** The functions that fetch a bare string as an image (CSS Images 4, CSS Values 5 `src()`). */
const FETCHING_FUNCTIONS = new Set([
  "image-set",
  "-webkit-image-set",
  "image",
  "src",
  "cross-fade",
  "-webkit-cross-fade",
]);

const OPENING = new Set(["(", "[", "{"]);
const CLOSING = new Set([")", "]", "}"]);
const opens = ({ type, text }: CssToken) => type === "function" || OPENING.has(text);

/**
 * The index of the last token of what starts at `start`: of a function, up to its `)`; of an
 * at-rule (§5.4.2), up to its `;` or the end of its `{}` block, or before the `}` around it.
 * The end of input ends both.
 */
const endOf = (tokens: CssToken[], start: number, rule: boolean) => {
  let depth = rule ? 0 : 1;
  for (let index = start + 1; index < tokens.length; index++) {
    const token = tokens[index];
    if (!token) break;
    if (opens(token)) depth++;
    else if (CLOSING.has(token.text)) {
      if (depth === 0) return index - 1;
      depth--;
      if (depth === 0 && (!rule || token.text === "}")) return index;
    } else if (rule && depth === 0 && token.text === ";") return index;
  }
  return tokens.length - 1;
};

const isImport = (tokens: CssToken[], index: number) => {
  const next = tokens[index + 1];
  return (
    tokens[index]?.text === "@" && next?.type === "ident" && next.name.toLowerCase() === "import"
  );
};

/** Whether the ident at `index` names a custom property (`--u: …`), which `var()` can carry anywhere. */
const isCustomProperty = (tokens: CssToken[], index: number) => {
  const token = tokens[index];
  if (token?.type !== "ident" || !token.name.startsWith("--")) return false;
  const next = tokens
    .slice(index + 1, index + 8)
    .find(({ type }) => type !== "whitespace" && type !== "comment");
  return next?.text === ":";
};

const joined = (tokens: CssToken[], start: number, end: number) =>
  tokens
    .slice(start, end + 1)
    .map(({ text }) => text)
    .join("");

/**
 * `url()` keeps what is inside the mail, and http(s) only when remote content is allowed. While
 * blocked, a remote address as a string in a fetching function (`image-set("https://…")`) or
 * in a custom property (`--u: "https://…"`, used as `image-set(var(--u))`) is emptied and
 * `@import` dropped; other strings (`content: "https://…"`) are text and stay.
 */
export const cleanCss = (
  css: string,
  { allowRemote, cidUrls, rules = false }: Options,
): { css: string; blocked: number } => {
  let blocked = 0;
  /** What stands for `url(address)`: itself, the local URL of an inline image, or `none`. */
  const image = (address: string, whole: string) => {
    const url = parsedUrl(address);
    if (url.startsWith("cid:")) {
      const local = cidUrls[url.slice(4).replace(/^<|>$/g, "")];
      return local ? `url("${local}")` : "none";
    }
    if (isInline(url) || (allowRemote && /^https?:/i.test(url))) return whole;
    if (!allowRemote && isFetched(url)) blocked++;
    return "none";
  };
  const tokens = tokenizeCss(css);
  const out: string[] = [];
  /** The open functions and parentheses around the current token, innermost last. */
  const open: string[] = [];
  /** How deep the value of a custom property started, or -1 outside one. */
  let custom = -1;
  let skipTo = -1;
  for (const [index, token] of tokens.entries()) {
    if (index <= skipTo) continue;
    if (token.type === "function") open.push(token.name.toLowerCase());
    else if (token.text === "(") open.push("(");
    else if (token.text === ")") open.pop();
    if (custom < 0 && isCustomProperty(tokens, index)) custom = open.length;
    else if ((token.text === ";" || token.text === "}") && open.length <= custom) custom = -1;
    if (rules && !allowRemote && isImport(tokens, index)) {
      skipTo = endOf(tokens, index, true);
      blocked++;
    } else if (token.type === "url") out.push(token.bad ? "none" : image(token.value, token.text));
    else if (token.type === "function" && token.name.toLowerCase() === "url") {
      open.pop();
      skipTo = endOf(tokens, index, false);
      let address = "";
      for (let part = index + 1; part <= skipTo && !address; part++) {
        const candidate = tokens[part];
        if (candidate?.type === "string") address = candidate.value;
      }
      out.push(image(address, joined(tokens, index, skipTo)));
    } else if (
      token.type === "string" &&
      !allowRemote &&
      (custom >= 0 || open.some((name) => FETCHING_FUNCTIONS.has(name))) &&
      isRemote(parsedUrl(token.value))
    ) {
      blocked++;
      out.push('""');
    } else out.push(token.text);
  }
  return { css: out.join(""), blocked };
};
