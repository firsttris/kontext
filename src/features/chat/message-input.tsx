/**
 * Writing a message: Enter sends, Shift+Enter starts a new line; "@" suggests colleagues (arrow
 * keys and Enter or Tab pick one). While one writes, the others see "… schreibt".
 */
import { AtSign, SendHorizontal } from "lucide-react";
import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  insertMention,
  keptMentions,
  mentionQuery,
  mentionSuggestions,
  type Person,
} from "@/lib/chat";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";

type Props = {
  placeholder: string;
  people: Person[];
  me: string;
  onSend: (text: string, mentions: string[]) => void;
  onTyping: () => void;
};

export const MessageInput = ({ placeholder, people, me, onSend, onTyping }: Props) => {
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [picked, setPicked] = useState<Person[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  // Where the cursor goes once the changed text is on screen (after picking a person): set
  // before the browser paints, so nothing typed meanwhile lands at the old place.
  const moveCaret = useRef<number | null>(null);
  useLayoutEffect(() => {
    const at = moveCaret.current;
    if (at === null || !field.current) return;
    moveCaret.current = null;
    field.current.focus();
    field.current.setSelectionRange(at, at);
  });

  const query = dismissed ? null : mentionQuery(text, caret);
  const suggestions = query === null ? [] : mentionSuggestions(people, query, me);
  const active = Math.min(highlight, Math.max(0, suggestions.length - 1));

  const update = (value: string, at: number) => {
    setText(value);
    setCaret(at);
    setDismissed(false);
    if (value.trim()) onTyping();
  };

  const pick = (person: Person) => {
    const next = insertMention(text, caret, person);
    setPicked((current) => [...current.filter((p) => p.id !== person.id), person]);
    moveCaret.current = next.caret;
    setText(next.text);
    setCaret(next.caret);
    setHighlight(0);
  };

  const send = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value, keptMentions(value, picked));
    setText("");
    setCaret(0);
    setPicked([]);
  };

  /** "@ Erwähnen": an "@" at the cursor, which opens the suggestions. */
  const startMention = () => {
    const at = field.current?.selectionStart ?? text.length;
    const before = text.slice(0, at);
    const token = before && !/\s$/.test(before) ? " @" : "@";
    moveCaret.current = at + token.length;
    update(before + token + text.slice(at), at + token.length);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setHighlight((active + step + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(suggestions[active]!);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissed(true);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      send();
    }
  };

  return (
    <div className="relative">
      {suggestions.length ? (
        <div
          role="listbox"
          aria-label={m.chat_mention_people()}
          className="absolute inset-x-0 bottom-full mb-2 flex flex-col gap-px rounded-xl border border-border bg-bg p-1 shadow-lg md:right-auto md:w-72"
        >
          {suggestions.map((person, index) => (
            <button
              key={person.id}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => pick(person)}
              className={cn(
                "flex h-10 items-center gap-2.5 rounded-lg px-2 text-left text-[14px] md:h-9",
                index === active ? "bg-subtle" : "hover:bg-hover",
              )}
            >
              <Avatar name={person.name} size={24} />
              {person.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="flex items-end gap-1.5 md:flex-col md:items-stretch md:gap-0 md:rounded-xl md:border md:border-border md:focus-within:border-muted">
        <label className="flex min-w-0 flex-1 rounded-[22px] border border-border md:rounded-none md:border-0">
          <span className="sr-only">{m.chat_message()}</span>
          <textarea
            ref={field}
            rows={1}
            value={text}
            placeholder={placeholder}
            onChange={(event) => update(event.target.value, event.target.selectionStart)}
            onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
            onKeyDown={onKeyDown}
            className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3.5 py-[11px] text-[15px] leading-[1.45] text-fg outline-none placeholder:text-muted md:min-h-[52px] md:py-3"
          />
        </label>
        <div className="flex items-center gap-0.5 md:px-2 md:pb-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="hidden text-muted md:inline-flex"
            onClick={startMention}
          >
            <AtSign size={14} /> {m.chat_mention()}
          </Button>
          <span className="hidden flex-1 md:block" />
          <Button
            variant="primary"
            aria-label={m.chat_send()}
            disabled={!text.trim()}
            onClick={send}
            className="size-11 rounded-full p-0 md:h-8 md:w-auto md:rounded-lg md:px-3.5"
          >
            <SendHorizontal size={17} className="md:hidden" />
            <span className="hidden md:inline">{m.chat_send()}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
