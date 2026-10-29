/**
 * What the mail and signature editors can write: StarterKit (with links), font size, text and
 * highlight colour, and tables. Everything goes out as inline styles, since mail programs drop a
 * <style> block or ignore classes (Outlook, Gmail); a table brings its lines and spacing along.
 */
import type { Extensions } from "@tiptap/core";
import { Image } from "@tiptap/extension-image";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import { BackgroundColor, Color, FontSize, TextStyle } from "@tiptap/extension-text-style";
import StarterKit from "@tiptap/starter-kit";
import { m } from "@/paraglide/messages";

const TABLE = "border-collapse:collapse;margin:8px 0";
const CELL = "border:1px solid #d4d4d8;padding:4px 8px;vertical-align:top;text-align:left";

/**
 * A table's or cell's own inline style: the one it came with (a quoted mail's layout table, a
 * draft) stays as it was, without lines of ours; one made here starts with `made`.
 */
const ownStyle = (made: string) => ({
  style: {
    default: made,
    // "" rather than null, which would fall back to the default and add our lines.
    parseHTML: (element: HTMLElement) => element.getAttribute("style") ?? "",
    renderHTML: ({ style }: { style?: string }) => (style ? { style } : {}),
  },
});

/** "Normal" is no size at all: the text keeps the reader's own. */
export const FONT_SIZES: { label: () => string; size: string | null }[] = [
  { label: m.fmt_size_small, size: "12px" },
  { label: m.fmt_size_normal, size: null },
  { label: m.fmt_size_large, size: "18px" },
  { label: m.fmt_size_huge, size: "24px" },
];

/** Colours that read on white and on the dark backgrounds some mail programs use. */
export const TEXT_COLORS: { label: () => string; color: string | null }[] = [
  { label: m.fmt_color_auto, color: null },
  { label: m.fmt_color_gray, color: "#6b7280" },
  { label: m.fmt_color_red, color: "#dc2626" },
  { label: m.fmt_color_orange, color: "#ea580c" },
  { label: m.fmt_color_green, color: "#16a34a" },
  { label: m.fmt_color_blue, color: "#2563eb" },
  { label: m.fmt_color_purple, color: "#7c3aed" },
];

export const HIGHLIGHTS: { label: () => string; color: string | null }[] = [
  { label: m.fmt_highlight_none, color: null },
  { label: m.fmt_highlight_yellow, color: "#fef08a" },
  { label: m.fmt_highlight_green, color: "#bbf7d0" },
  { label: m.fmt_highlight_blue, color: "#bfdbfe" },
  { label: m.fmt_highlight_pink, color: "#fbcfe8" },
  { label: m.fmt_highlight_gray, color: "#e5e7eb" },
];

/**
 * An image in the text of a mail, resized by dragging its corners; it keeps its Content-ID
 * (`data-cid`, lib/inline-images.ts) and never grows past the width of the text.
 */
const MailImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      cid: {
        default: null,
        parseHTML: (element: HTMLElement) => element.getAttribute("data-cid"),
        renderHTML: (attributes: { cid?: string | null }) =>
          attributes.cid ? { "data-cid": attributes.cid } : {},
      },
    };
  },
}).configure({
  inline: true,
  HTMLAttributes: { style: "max-width:100%;height:auto" },
  resize: { enabled: true, minWidth: 40, minHeight: 20, alwaysPreserveAspectRatio: true },
});

/** `images`: pictures in the text (the composer; a signature's would need a home of their own). */
export const richText = ({ autolink = false, images = false } = {}): Extensions => [
  ...(images ? [MailImage] : []),
  StarterKit.configure({ link: { openOnClick: false, autolink } }),
  TextStyle,
  FontSize,
  Color,
  BackgroundColor,
  Table.extend({
    addAttributes() {
      return { ...this.parent?.(), ...ownStyle(TABLE) };
    },
  }).configure({ resizable: false }),
  TableRow,
  TableHeader.extend({
    addAttributes() {
      return { ...this.parent?.(), ...ownStyle(`${CELL};font-weight:600`) };
    },
  }),
  TableCell.extend({
    addAttributes() {
      return { ...this.parent?.(), ...ownStyle(CELL) };
    },
  }),
];
