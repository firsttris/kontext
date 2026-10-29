/**
 * The always visible formatting bar of the composer (as in the mockup: B I U S, lists, indent,
 * link), then size, colours and tables (format-menus.tsx).
 */
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import {
  Bold,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  type LucideIcon,
  Quote,
  RemoveFormatting,
  Strikethrough,
  Underline,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { FormatMenus } from "./format-menus";

type Tool = {
  label: string;
  icon: LucideIcon;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
};

const promptLink = (editor: Editor) => {
  const previous = editor.getAttributes("link").href as string | undefined;
  const url = window.prompt(m.fmt_link_prompt(), previous ?? "https://");
  if (url === null) return;
  if (url === "" || url === "https://")
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
  else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
};

const groups: Tool[][] = [
  [
    {
      label: m.fmt_bold(),
      icon: Bold,
      run: (e) => e.chain().focus().toggleBold().run(),
      active: (e) => e.isActive("bold"),
    },
    {
      label: m.fmt_italic(),
      icon: Italic,
      run: (e) => e.chain().focus().toggleItalic().run(),
      active: (e) => e.isActive("italic"),
    },
    {
      label: m.fmt_underline(),
      icon: Underline,
      run: (e) => e.chain().focus().toggleUnderline().run(),
      active: (e) => e.isActive("underline"),
    },
    {
      label: m.fmt_strike(),
      icon: Strikethrough,
      run: (e) => e.chain().focus().toggleStrike().run(),
      active: (e) => e.isActive("strike"),
    },
  ],
  [
    {
      label: m.fmt_bullets(),
      icon: List,
      run: (e) => e.chain().focus().toggleBulletList().run(),
      active: (e) => e.isActive("bulletList"),
    },
    {
      label: m.fmt_numbers(),
      icon: ListOrdered,
      run: (e) => e.chain().focus().toggleOrderedList().run(),
      active: (e) => e.isActive("orderedList"),
    },
    {
      label: m.fmt_outdent(),
      icon: IndentDecrease,
      run: (e) => e.chain().focus().liftListItem("listItem").run(),
    },
    {
      label: m.fmt_indent(),
      icon: IndentIncrease,
      run: (e) => e.chain().focus().sinkListItem("listItem").run(),
    },
  ],
  [
    { label: m.fmt_link(), icon: Link2, run: promptLink, active: (e) => e.isActive("link") },
    {
      label: m.fmt_quote(),
      icon: Quote,
      run: (e) => e.chain().focus().toggleBlockquote().run(),
      active: (e) => e.isActive("blockquote"),
    },
    {
      label: m.fmt_clear(),
      icon: RemoveFormatting,
      run: (e) => e.chain().focus().unsetAllMarks().clearNodes().run(),
    },
  ],
];

/** `extra`: more for the end of the bar, e.g. the snippets. */
export const EditorToolbar = ({ editor, extra }: { editor: Editor; extra?: ReactNode }) => {
  // Re-render when the selection or marks change, so the active buttons are right.
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) => groups.flat().map((tool) => tool.active?.(current) ?? false),
  });
  let index = 0;
  return (
    <div
      role="toolbar"
      aria-label="Formatierung"
      className="flex flex-wrap items-center gap-0.5 border-b border-border px-2 py-1"
    >
      {groups.map((group, groupIndex) => (
        <div key={group[0]!.label} className="flex items-center gap-0.5">
          {groupIndex > 0 ? <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" /> : null}
          {group.map((tool) => {
            const on = active[index++] ?? false;
            const Icon = tool.icon;
            return (
              <button
                key={tool.label}
                type="button"
                title={tool.label}
                aria-label={tool.label}
                aria-pressed={tool.active ? on : undefined}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => tool.run(editor)}
                className={cn(
                  "flex size-8 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg",
                  on && "bg-subtle text-fg",
                )}
              >
                <Icon size={15} strokeWidth={1.9} />
              </button>
            );
          })}
        </div>
      ))}
      <div className="flex items-center gap-0.5">
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
        <FormatMenus editor={editor} />
      </div>
      {extra ? (
        <div className="flex items-center gap-0.5">
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          {extra}
        </div>
      ) : null}
    </div>
  );
};
