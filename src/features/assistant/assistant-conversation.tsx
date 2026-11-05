/**
 * The assistant in the chat: ask in words, it looks things up in mail, calendars, contacts and
 * tasks with the person's own rights and may save drafts, appointments, contacts and tasks. The
 * conversation stays in this tab until it is reloaded or "Neues Gespräch" clears it.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, RotateCcw, SendHorizontal, Sparkles } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useBack } from "@/components/use-back";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { getLocale } from "@/paraglide/runtime";
import { type AskFailure, askAssistant, type Turn } from "./assistant";

type Entry = Turn & { done?: string[]; incomplete?: boolean; failure?: AskFailure };

/**
 * Kept in the query cache, not in the component: switching to a channel and back keeps the
 * conversation, and signing out or in clears it with everything else (src/main.tsx), so the next
 * person in this tab does not get it. Its own key: invalidating ["assistant"] leaves it alone.
 */
const CONVERSATION = ["assistant-conversation"];

const useConversation = () => {
  const queryClient = useQueryClient();
  const [entries, setShown] = useState<Entry[]>(
    () => queryClient.getQueryData<Entry[]>(CONVERSATION) ?? [],
  );
  const setEntries = (next: Entry[]) => {
    setShown(next);
    // Without anyone watching it, a query is dropped after five minutes; this one is not.
    queryClient.setQueryDefaults(CONVERSATION, { gcTime: Number.POSITIVE_INFINITY });
    queryClient.setQueryData(CONVERSATION, next);
  };
  return [entries, setEntries] as const;
};

/**
 * What goes to the server: the questions and answers, without the failed tries and without
 * answers that brought no text (cut short, or only what was created): the server takes no empty
 * turn (server/assistant/routes.ts).
 */
export const turnsOf = (entries: Entry[]): Turn[] =>
  entries
    .filter((entry) => !entry.failure && entry.text.trim() !== "")
    .map(({ role, text }) => ({ role, text }));

const failureText = (failure: AskFailure) =>
  failure === "too-many" ? m.assistant_too_many() : m.assistant_failed();

const Bubble = ({ entry }: { entry: Entry }) => {
  const own = entry.role === "user";
  return (
    <li className={cn("flex flex-col gap-1", own ? "items-end" : "items-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-3.5 py-2 text-[15px] leading-[1.5] break-words whitespace-pre-wrap md:text-[14px]",
          own ? "bg-[var(--bubble-own)]" : "bg-[var(--bubble)]",
          entry.failure && "text-danger",
        )}
      >
        {entry.failure ? failureText(entry.failure) : entry.text}
        {entry.incomplete ? (
          <span className="mt-1 block text-[13px] text-muted">{m.assistant_incomplete()}</span>
        ) : null}
      </div>
      {entry.done?.length ? (
        <ul
          aria-label={m.assistant_done()}
          className="m-0 flex max-w-[85%] list-none flex-col gap-1 p-0"
        >
          {entry.done.map((line) => (
            <li key={line} className="flex items-start gap-1.5 text-[13px] text-muted">
              <Check size={14} className="mt-0.5 shrink-0 text-ok" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
};

export const AssistantConversation = () => {
  const navigate = useNavigate();
  const back = useBack();
  const [entries, setEntries] = useConversation();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLLIElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrolls down whenever an entry comes
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end" });
  }, [entries]);

  const ask = async () => {
    const question = text.trim();
    if (!question || busy) return;
    const asked: Entry[] = [...entries, { role: "user", text: question }];
    setEntries(asked);
    setText("");
    setBusy(true);
    const result = await askAssistant(turnsOf(asked));
    setBusy(false);
    setEntries([
      ...asked,
      result.ok
        ? { role: "assistant", ...result.answer }
        : { role: "assistant", text: "", failure: result.failure },
    ]);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void ask();
  };
  // Enter asks, Shift+Enter starts a new line, as in the chat's own field.
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void ask();
  };
  const toList = () => back(() => void navigate({ to: "/chat", search: {}, replace: true }));

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2 md:gap-3 md:px-5">
        <button
          type="button"
          onClick={toList}
          aria-label={m.chat_back()}
          className="flex size-11 items-center justify-center text-fg md:hidden"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="m-0 flex min-w-0 flex-1 items-center gap-2 truncate text-[16px] font-semibold md:text-[17px]">
          <Sparkles size={16} aria-hidden="true" className="shrink-0 text-accent" />
          {m.assistant_title()}
        </h1>
        {entries.length ? (
          <Button variant="ghost" size="sm" onClick={() => setEntries([])} disabled={busy}>
            <RotateCcw size={14} aria-hidden="true" /> {m.assistant_new()}
          </Button>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-4 md:px-5">
        {entries.length ? null : (
          <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 text-center text-[14px] text-muted">
            <Sparkles size={28} strokeWidth={1.5} aria-hidden="true" />
            <p className="m-0">{m.assistant_intro()}</p>
          </div>
        )}
        <ul aria-label={m.assistant_title()} className="m-0 flex list-none flex-col gap-3 p-0">
          {entries.map((entry, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a conversation only grows at its end.
            <Bubble key={index} entry={entry} />
          ))}
          {busy ? (
            <li role="status" className="text-[13px] text-muted">
              {m.assistant_thinking()}
            </li>
          ) : null}
          <li ref={end} aria-hidden="true" />
        </ul>
      </div>
      <form
        onSubmit={onSubmit}
        className="flex shrink-0 flex-col gap-1.5 border-t border-border px-3 py-2 md:px-5"
      >
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            spellCheck
            lang={getLocale()}
            value={text}
            aria-label={m.assistant_input()}
            placeholder={m.assistant_input()}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={onKeyDown}
            className="min-h-11 flex-1 resize-none rounded-lg border border-border bg-bg px-3 py-2 text-[15px] md:text-[14px]"
          />
          <Button
            type="submit"
            variant="primary"
            size="iconLg"
            disabled={busy || !text.trim()}
            aria-label={m.chat_send()}
          >
            <SendHorizontal size={16} aria-hidden="true" />
          </Button>
        </div>
        <p className="m-0 text-[12px] text-muted">{m.assistant_note()}</p>
      </form>
    </>
  );
};
