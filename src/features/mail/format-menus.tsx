/**
 * The formatting bar's menus: font size, text and background colour, and tables (insert, then
 * rows and columns while the cursor is in one). The choices are in rich-text.ts.
 */
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { ALargeSmall, Baseline, Highlighter, type LucideIcon, Table2 } from "lucide-react";
import type { ReactNode } from "react";
import { MenuContent, MenuItem, MenuRoot, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { FONT_SIZES, HIGHLIGHTS, TEXT_COLORS } from "./rich-text";

const FormatMenu = ({
  label,
  icon: Icon,
  on = false,
  children,
}: {
  label: string;
  icon: LucideIcon;
  on?: boolean;
  children: ReactNode;
}) => (
  <MenuRoot modal={false}>
    <MenuTrigger asChild>
      <button
        type="button"
        title={label}
        aria-label={label}
        onMouseDown={(event) => event.preventDefault()}
        className={cn(
          "flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg",
          on && "bg-subtle text-fg",
        )}
      >
        <Icon size={15} strokeWidth={1.9} />
      </button>
    </MenuTrigger>
    {/* Focus goes back to the text, so the choice applies where the cursor was. */}
    <MenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
      {children}
    </MenuContent>
  </MenuRoot>
);

const Swatch = ({ color, text }: { color: string | null; text?: boolean }) => (
  <span
    aria-hidden="true"
    className="flex size-5 items-center justify-center rounded border border-border text-[12px] font-semibold"
    style={text ? { color: color ?? undefined } : { background: color ?? undefined }}
  >
    {text ? "A" : null}
  </span>
);

const TABLE_TOOLS: [() => string, (editor: Editor) => boolean][] = [
  [m.fmt_table_row_above, (e) => e.chain().focus().addRowBefore().run()],
  [m.fmt_table_row_below, (e) => e.chain().focus().addRowAfter().run()],
  [m.fmt_table_col_left, (e) => e.chain().focus().addColumnBefore().run()],
  [m.fmt_table_col_right, (e) => e.chain().focus().addColumnAfter().run()],
  [m.fmt_table_header, (e) => e.chain().focus().toggleHeaderRow().run()],
  [m.fmt_table_row_delete, (e) => e.chain().focus().deleteRow().run()],
  [m.fmt_table_col_delete, (e) => e.chain().focus().deleteColumn().run()],
  [m.fmt_table_delete, (e) => e.chain().focus().deleteTable().run()],
];

export const FormatMenus = ({ editor }: { editor: Editor }) => {
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const style = current.getAttributes("textStyle");
      return {
        size: (style.fontSize as string | undefined) ?? null,
        color: (style.color as string | undefined) ?? null,
        highlight: (style.backgroundColor as string | undefined) ?? null,
        inTable: current.isActive("table"),
      };
    },
  });
  return (
    <>
      <FormatMenu label={m.fmt_size()} icon={ALargeSmall} on={Boolean(state.size)}>
        {FONT_SIZES.map(({ label, size }) => (
          <MenuItem
            key={label()}
            aria-checked={state.size === size}
            role="menuitemradio"
            onSelect={() =>
              size
                ? editor.chain().focus().setFontSize(size).run()
                : editor.chain().focus().unsetFontSize().removeEmptyTextStyle().run()
            }
          >
            <span style={{ fontSize: size ?? undefined }}>{label()}</span>
          </MenuItem>
        ))}
      </FormatMenu>
      <FormatMenu label={m.fmt_color()} icon={Baseline} on={Boolean(state.color)}>
        {TEXT_COLORS.map(({ label, color }) => (
          <MenuItem
            key={label()}
            aria-checked={state.color === color}
            role="menuitemradio"
            onSelect={() =>
              color
                ? editor.chain().focus().setColor(color).run()
                : editor.chain().focus().unsetColor().removeEmptyTextStyle().run()
            }
          >
            <Swatch color={color} text /> {label()}
          </MenuItem>
        ))}
      </FormatMenu>
      <FormatMenu label={m.fmt_highlight()} icon={Highlighter} on={Boolean(state.highlight)}>
        {HIGHLIGHTS.map(({ label, color }) => (
          <MenuItem
            key={label()}
            aria-checked={state.highlight === color}
            role="menuitemradio"
            onSelect={() =>
              color
                ? editor.chain().focus().setBackgroundColor(color).run()
                : editor.chain().focus().unsetBackgroundColor().removeEmptyTextStyle().run()
            }
          >
            <Swatch color={color} /> {label()}
          </MenuItem>
        ))}
      </FormatMenu>
      <FormatMenu label={m.fmt_table()} icon={Table2} on={state.inTable}>
        <MenuItem
          onSelect={() =>
            editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run()
          }
        >
          {m.fmt_table_insert()}
        </MenuItem>
        {state.inTable ? (
          <>
            <MenuSeparator />
            {TABLE_TOOLS.map(([label, run]) => (
              <MenuItem key={label()} onSelect={() => run(editor)}>
                {label()}
              </MenuItem>
            ))}
          </>
        ) : null}
      </FormatMenu>
    </>
  );
};
