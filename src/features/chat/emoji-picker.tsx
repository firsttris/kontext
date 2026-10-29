/**
 * Any emoji for a reaction: a search field (English or German words), a row of categories and
 * the emojis of src/lib/emoji.ts in a grid. In the popover beside a message (reactions.tsx) and
 * in the sheet a long press opens on a phone (message-actions.tsx).
 */
import { Search } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { EMOJI_CATEGORIES, type Emoji, emojiName, searchEmojis } from "@/lib/emoji";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";

const EmojiButton = ({ emoji, onPick }: { emoji: Emoji; onPick: (emoji: string) => void }) => {
  const name = emojiName(emoji, getLocale());
  return (
    <button
      type="button"
      aria-label={m.chat_react_with({ emoji: `${emoji.emoji} ${name}` })}
      title={name}
      onClick={() => onPick(emoji.emoji)}
      className="flex size-10 items-center justify-center rounded-lg text-[22px] hover:bg-hover focus-visible:bg-hover md:size-9 md:text-[20px]"
    >
      {emoji.emoji}
    </button>
  );
};

const Grid = ({
  emojis,
  label,
  onPick,
}: {
  emojis: Emoji[];
  label: string;
  onPick: (emoji: string) => void;
}) => (
  <ul aria-label={label} className="m-0 grid list-none grid-cols-8 gap-0.5 p-0">
    {emojis.map((emoji) => (
      <li key={emoji.emoji}>
        <EmojiButton emoji={emoji} onPick={onPick} />
      </li>
    ))}
  </ul>
);

export const EmojiPicker = ({
  onPick,
  className,
}: {
  onPick: (emoji: string) => void;
  className?: string;
}) => {
  const [query, setQuery] = useState("");
  const found = useMemo(() => searchEmojis(query), [query]);
  const sections = useRef<Record<string, HTMLElement | null>>({});
  return (
    <div className={cn("flex min-h-0 flex-col gap-2", className)}>
      <label className="flex h-10 items-center gap-2 rounded-lg border border-border px-2.5 focus-within:border-muted md:h-9">
        <Search size={15} aria-hidden="true" className="shrink-0 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label={m.emoji_search()}
          placeholder={m.emoji_search()}
          className="min-w-0 flex-1 bg-transparent text-[16px] outline-none md:text-[14px]"
        />
      </label>
      {query.trim() ? null : (
        <nav aria-label={m.emoji_more()} className="flex justify-between">
          {EMOJI_CATEGORIES.map((category) => (
            <button
              key={category.id}
              type="button"
              aria-label={category.label()}
              title={category.label()}
              onClick={() => sections.current[category.id]?.scrollIntoView({ block: "start" })}
              className="flex size-8 items-center justify-center rounded-md text-[16px] hover:bg-hover"
            >
              {category.emojis[0]?.emoji}
            </button>
          ))}
        </nav>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {query.trim() ? (
          found.length ? (
            <Grid emojis={found} label={m.emoji_results()} onPick={onPick} />
          ) : (
            <p className="m-0 py-6 text-center text-[13px] text-muted">{m.emoji_none()}</p>
          )
        ) : (
          EMOJI_CATEGORIES.map((category) => (
            <section
              key={category.id}
              ref={(element) => {
                sections.current[category.id] = element;
              }}
              aria-label={category.label()}
            >
              <h3 className="m-0 px-1 pt-2 pb-1 text-[12px] font-medium text-muted">
                {category.label()}
              </h3>
              <Grid emojis={category.emojis} label={category.label()} onPick={onPick} />
            </section>
          ))
        )}
      </div>
    </div>
  );
};
