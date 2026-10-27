/**
 * Writing a message: Enter sends, Shift+Enter starts a new line; "@" suggests colleagues (arrow
 * keys and Enter or Tab pick one). While one writes, the others see "… schreibt". With
 * `attachments`: photos and files (also pasted), mails, tasks or contacts as cards, and voice
 * messages (on a phone the microphone stands where "Senden" does while there is nothing to send).
 */
import { AtSign, Camera, Link2, Mic, Paperclip, Plus, SendHorizontal } from "lucide-react";
import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { ColleagueAvatar } from "@/features/photos/colleague-avatar";
import {
  insertMention,
  keptMentions,
  mentionQuery,
  mentionSuggestions,
  type Person,
} from "@/lib/chat";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { InputTray } from "./input-tray";
import { LinkPicker, useLinkTitle } from "./link-picker";
import type { Attachments } from "./use-attachments";
import { useVoiceRecorder } from "./use-voice-recorder";
import { VoiceRecorderBar } from "./voice-recorder-bar";

type Props = {
  placeholder: string;
  people: Person[];
  me: string;
  onSend: (text: string, mentions: string[]) => void;
  onTyping: () => void;
  attachments?: Attachments;
  /** Something goes along anyway (a mail being discussed), so a message without text is fine. */
  allowEmpty?: boolean;
  /** Mails, tasks and contacts as cards; not in a confidential channel (they are not encrypted). */
  cards?: boolean;
  autoFocus?: boolean;
};

export const MessageInput = ({
  placeholder,
  people,
  me,
  onSend,
  onTyping,
  attachments,
  allowEmpty = false,
  cards = true,
  autoFocus = false,
}: Props) => {
  const field = useRef<HTMLTextAreaElement>(null);
  const filePicker = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [linking, setLinking] = useState(false);
  const linkTitle = useLinkTitle();
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

  const hasContent =
    Boolean(text.trim()) || allowEmpty || Boolean(attachments && !attachments.empty);
  const canSend = hasContent && !attachments?.uploading;

  const send = () => {
    const value = text.trim();
    if (!canSend) return;
    onSend(value, keptMentions(value, picked));
    setText("");
    setCaret(0);
    setPicked([]);
  };

  const toast = useToast();
  const voice = useVoiceRecorder({ onError: (message) => toast.show(message, "error") });
  // A finished recording goes up like a file and is sent once it is there.
  const [sendVoice, setSendVoice] = useState(false);
  const sendNow = useRef(send);
  sendNow.current = send;
  const uploading = Boolean(attachments?.uploading);
  const nothingAttached = attachments?.empty ?? true;
  useEffect(() => {
    if (!sendVoice || uploading) return;
    setSendVoice(false);
    // Nothing there: the upload failed, and said so.
    if (!nothingAttached) sendNow.current();
  }, [sendVoice, uploading, nothingAttached]);
  const sendRecording = async () => {
    const file = await voice.stop();
    if (!file || !attachments) return;
    attachments.addFiles([file]);
    setSendVoice(true);
  };
  const micInsteadOfSend = Boolean(attachments) && !hasContent;
  const micButton = (
    <Button
      variant="primary"
      aria-label={m.chat_voice_record()}
      title={m.chat_voice_record()}
      onClick={() => void voice.start()}
      className="size-11 rounded-full p-0 md:hidden"
    >
      <Mic size={18} />
    </Button>
  );

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
              <ColleagueAvatar id={person.id} name={person.name} size={24} />
              {person.name}
            </button>
          ))}
        </div>
      ) : null}
      {attachments ? (
        <>
          <input
            ref={filePicker}
            type="file"
            multiple
            hidden
            onChange={(event) => {
              if (event.target.files) attachments.addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <input
            ref={camera}
            type="file"
            accept="image/*"
            capture="environment"
            hidden
            onChange={(event) => {
              if (event.target.files) attachments.addFiles(event.target.files);
              event.target.value = "";
            }}
          />
          {linking ? (
            <LinkPicker
              onPick={attachments.addCard}
              onClose={() => setLinking(false)}
              // Back to writing, so Enter sends the card.
              onClosed={() => field.current?.focus()}
            />
          ) : null}
        </>
      ) : null}
      <div className="md:rounded-xl md:border md:border-border md:focus-within:border-muted">
        {attachments ? <InputTray attachments={attachments} /> : null}
        {voice.recording ? (
          <VoiceRecorderBar
            seconds={voice.seconds}
            onDiscard={voice.discard}
            onSend={() => void sendRecording()}
          />
        ) : null}
        <div
          className={cn(
            "flex items-end gap-1.5 md:flex-col md:items-stretch md:gap-0",
            voice.recording && "hidden",
          )}
        >
          {attachments ? (
            <MenuRoot>
              <MenuTrigger
                aria-label={m.chat_add()}
                className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-fg md:hidden"
              >
                <Plus size={19} />
              </MenuTrigger>
              <MenuContent side="top" align="start">
                <MenuItem onSelect={() => camera.current?.click()}>
                  <Camera size={15} /> {m.chat_take_photo()}
                </MenuItem>
                <MenuItem onSelect={() => filePicker.current?.click()}>
                  <Paperclip size={15} /> {m.chat_attach()}
                </MenuItem>
                {cards ? (
                  <MenuItem onSelect={() => setLinking(true)}>
                    <Link2 size={15} /> {linkTitle}
                  </MenuItem>
                ) : null}
              </MenuContent>
            </MenuRoot>
          ) : null}
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
              onPaste={(event) => {
                if (!attachments || !event.clipboardData.files.length) return;
                event.preventDefault();
                attachments.addFiles(event.clipboardData.files);
              }}
              autoFocus={autoFocus}
              className="field-sizing-content max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3.5 py-[11px] text-[15px] leading-[1.45] text-fg outline-none placeholder:text-muted md:min-h-[52px] md:py-3"
            />
          </label>
          <div className="flex items-center gap-0.5 md:px-2 md:pb-1.5">
            {attachments ? (
              <>
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={m.chat_attach()}
                  title={m.chat_attach()}
                  className="hidden md:inline-flex"
                  onClick={() => filePicker.current?.click()}
                >
                  <Paperclip size={16} />
                </Button>
                {cards ? (
                  <Button
                    variant="ghost"
                    size="iconSm"
                    aria-label={linkTitle}
                    title={linkTitle}
                    className="hidden md:inline-flex"
                    onClick={() => setLinking(true)}
                  >
                    <Link2 size={16} />
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="iconSm"
                  aria-label={m.chat_voice_record()}
                  title={m.chat_voice_record()}
                  className="hidden md:inline-flex"
                  onClick={() => void voice.start()}
                >
                  <Mic size={16} />
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="hidden text-muted md:inline-flex"
              onClick={startMention}
            >
              <AtSign size={14} /> {m.chat_mention()}
            </Button>
            <span className="hidden flex-1 md:block" />
            {micInsteadOfSend ? micButton : null}
            <Button
              variant="primary"
              aria-label={m.chat_send()}
              disabled={!canSend}
              onClick={send}
              className={cn(
                "size-11 rounded-full p-0 md:h-8 md:w-auto md:rounded-lg md:px-3.5",
                micInsteadOfSend && "hidden md:inline-flex",
              )}
            >
              <SendHorizontal size={17} className="md:hidden" />
              <span className="hidden md:inline">{m.chat_send()}</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
