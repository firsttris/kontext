/**
 * Fixed colours of a foreign mail in the dark theme. A mail written on white sets them for white
 * paper (Outlook: `color:black;background:white`, its dark blue `#1F497D`); on the dark page such
 * text is unreadable, or stands as a white bar. As Gmail and Outlook on the web do, the lightness
 * is turned around and hue and saturation kept: white paper turns dark, dark text light. Pure.
 */

type Rgb = { r: number; g: number; b: number };

/** The named colours mails use (Outlook's `windowtext` among them); others stay as they are. */
const NAMED: Record<string, string> = {
  black: "#000000",
  windowtext: "#000000",
  white: "#ffffff",
  window: "#ffffff",
  navy: "#000080",
  darkblue: "#00008b",
  blue: "#0000ff",
  maroon: "#800000",
  darkred: "#8b0000",
  red: "#ff0000",
  green: "#008000",
  darkgreen: "#006400",
  purple: "#800080",
  teal: "#008080",
  olive: "#808000",
  gray: "#808080",
  grey: "#808080",
  dimgray: "#696969",
  dimgrey: "#696969",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
  silver: "#c0c0c0",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  gainsboro: "#dcdcdc",
  whitesmoke: "#f5f5f5",
  snow: "#fffafa",
  ivory: "#fffff0",
  beige: "#f5f5dc",
  lightyellow: "#ffffe0",
  yellow: "#ffff00",
  lime: "#00ff00",
  cyan: "#00ffff",
  aqua: "#00ffff",
  magenta: "#ff00ff",
  fuchsia: "#ff00ff",
  orange: "#ffa500",
};

const fromHex = (hex: string): Rgb | null => {
  const digits = hex.length <= 4 ? [...hex].map((digit) => digit + digit).join("") : hex;
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/.test(digits)) return null;
  // Mostly transparent: the page shines through, nothing to turn around.
  if (digits.length === 8 && Number.parseInt(digits.slice(6), 16) < 128) return null;
  const channel = (index: number) => Number.parseInt(digits.slice(index, index + 2), 16);
  return { r: channel(0), g: channel(2), b: channel(4) };
};

/** `rgb(1, 2, 3)`, `rgba(1,2,3,.5)` and `rgb(1 2 3 / 50%)`; percentages per channel too. */
const fromRgb = (value: string): Rgb | null => {
  const inner = /^rgba?\(([^)]*)\)$/.exec(value)?.[1];
  if (!inner) return null;
  const parts = inner.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3) return null;
  const number = (part: string, scale: number) =>
    part.endsWith("%") ? (Number.parseFloat(part) / 100) * scale : Number.parseFloat(part);
  const [r, g, b] = parts.slice(0, 3).map((part) => Math.round(number(part, 255)));
  const alpha = parts[3] === undefined ? 1 : number(parts[3], 1);
  if ([r, g, b, alpha].some((channel) => Number.isNaN(channel)) || alpha < 0.5) return null;
  return { r: r!, g: g!, b: b! };
};

/** A colour as CSS or the `color`/`bgcolor` attributes write it, or null if it is none of these. */
export const parseColor = (value: string): Rgb | null => {
  const color = value
    .trim()
    .toLowerCase()
    .replace(/\s*!important$/, "");
  const named = NAMED[color];
  if (named) return fromHex(named.slice(1));
  if (color.startsWith("#")) return fromHex(color.slice(1));
  // `bgcolor="FFFFFF"`: browsers read the attribute without the #.
  if (/^[0-9a-f]{6}$/.test(color)) return fromHex(color);
  return fromRgb(color);
};

/** Relative luminance (WCAG 2.2, 1.4.3). */
const luminance = ({ r, g, b }: Rgb) => {
  const linear = (channel: number) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

type Hsl = { h: number; s: number; l: number };

const toHsl = ({ r, g, b }: Rgb): Hsl => {
  const [red, green, blue] = [r / 255, g / 255, b / 255];
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === red
      ? ((green - blue) / d + (green < blue ? 6 : 0)) / 6
      : max === green
        ? ((blue - red) / d + 2) / 6
        : ((red - green) / d + 4) / 6;
  return { h, s, l };
};

const toRgb = ({ h, s, l }: Hsl): Rgb => {
  if (s === 0) {
    const grey = Math.round(l * 255);
    return { r: grey, g: grey, b: grey };
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (offset: number) => {
    const t = (((h + offset) % 1) + 1) % 1;
    const value =
      t < 1 / 6
        ? p + (q - p) * 6 * t
        : t < 1 / 2
          ? q
          : t < 2 / 3
            ? p + (q - p) * (2 / 3 - t) * 6
            : p;
    return Math.round(value * 255);
  };
  return { r: channel(1 / 3), g: channel(0), b: channel(-1 / 3) };
};

const css = ({ r, g, b }: Rgb) => `rgb(${r}, ${g}, ${b})`;

/**
 * Turned paper is at most this light; dark like the page, whatever its hue. Turning the lightness
 * alone is not enough: a saturated colour at half lightness (Outlook's yellow highlight) stays
 * itself, and white text would stand on yellow.
 */
const DARK_PAPER = 0.02;

/**
 * Text needs 4.5:1 against the darkest it can stand on: the page (`#09090b`, luminance ≈ 0.003)
 * and turned paper (≤ 0.02). (0.27 + 0.05) / (0.02 + 0.05) ≈ 4.6.
 * The lightness is turned around first, then raised further if that is not enough (pure blue).
 */
const READABLE = 0.27;

/** The text colour for the dark theme, or null if it can stay. */
export const darkTextColor = (value: string): string | null => {
  const color = parseColor(value);
  if (!color || luminance(color) >= READABLE) return null;
  const hsl = toHsl(color);
  let turned: Hsl = { ...hsl, l: Math.max(1 - hsl.l, hsl.l) };
  while (luminance(toRgb(turned)) < READABLE && turned.l < 1) {
    turned = { ...turned, l: Math.min(1, turned.l + 0.05) };
  }
  return css(toRgb(turned));
};

/**
 * Paper lighter than this turns dark; darker colours (a blue button) stay. Black text, turned
 * white, still reaches 4.5:1 on what stays: (1 + 0.05) / (0.18 + 0.05) ≈ 4.6.
 */
const LIGHT_PAPER = 0.18;

/** The background colour for the dark theme, or null if it can stay. */
export const darkBackgroundColor = (value: string): string | null => {
  const color = parseColor(value);
  if (!color || luminance(color) < LIGHT_PAPER) return null;
  const hsl = toHsl(color);
  let turned: Hsl = { ...hsl, l: 1 - hsl.l };
  while (luminance(toRgb(turned)) > DARK_PAPER && turned.l > 0) {
    turned = { ...turned, l: Math.max(0, turned.l - 0.02) };
  }
  return css(toRgb(turned));
};

/**
 * `color`, `background-color` and `background` declarations in a stylesheet (`<style>`), each
 * turned when its value is a lone colour; everything else stays as written. Inline colours alone
 * are not enough: text turned light on a card made white by a class would vanish.
 */
const DECLARATION = /(?<![\w-])(background-color|background|color)(\s*:\s*)([^;{}]*)/gi;

export const darkStylesheet = (css: string): string =>
  css.replace(DECLARATION, (whole, property: string, colon: string, value: string) => {
    const important = /\s*!important\s*$/i.exec(value)?.[0] ?? "";
    const trailing = /\s*$/.exec(value.slice(0, value.length - important.length))?.[0] ?? "";
    const color = value.slice(0, value.length - important.length - trailing.length);
    const turned =
      property.toLowerCase() === "color" ? darkTextColor(color) : darkBackgroundColor(color);
    return turned ? `${property}${colon}${turned}${trailing}${important}` : whole;
  });
