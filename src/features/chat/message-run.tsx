/**
 * Messages of one person close together: on a desktop under one name with the avatar, on a phone
 * as bubbles (the own on the right). Each message shows its text, photos, files and cards, the
 * tasks made from it, its reactions and answers, and its actions.
 */
import { ListChecks } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { useLongPress } from "@/components/use-long-press";
import { useMediaQuery } from "@/components/use-media-query";
import { CallLine } from "@/features/calls/call-line";
import { ItemLink } from "@/features/links/item-link";
import { ColleagueAvatar } from "@/features/photos/colleague-avatar";
import { useStatusLabel, useTasks } from "@/features/tasks/queries";
import { firstName, keptMentions, type Message, type MessageRun, type Person } from "@/lib/chat";
import { tasksOfMessage } from "@/lib/chat-cards";
import { hasNewReplies } from "@/lib/chat-threads";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { ForgedNote, SealedLine, type Shown, useOpened, useSealedUrls } from "./confidential";
import { ActionSheet, HoverBar, type MessageActions, useCopyText } from "./message-actions";
import { MessageCard } from "./message-card";
import { MessageFiles } from "./message-files";
import { MessageText } from "./message-text";
import { ReactionBar } from "./reactions";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });

export const isPending = (message: Message) => message.id.startsWith("pending-");

type Props = {
  run: MessageRun;
  me: string;
  people: Person[];
  nameOf: (id: string) => string;
  /** The message to point at (opened from a task), marked for a moment. */
  highlight?: string;
  onMakeTask: (message: Message) => void;
  onEdit: (message: Message, text: string, mentions: string[]) => void;
  onDelete: (message: Message) => void;
  onReact: (message: Message, emoji: string) => void;
  /** Opens the thread of a message; left out within a thread (no answers to answers). */
  onReply?: (message: Message) => void;
  /** Answers after this are marked as new. */
  readUpTo?: string | null;
};

const replyTime = (iso: string) =>
  new Date(iso).toLocaleString("de-DE", {
    timeZone: "Europe/Berlin",
    ...(new Date(iso).toDateString() === new Date().toDateString()
      ? { hour: "2-digit", minute: "2-digit" }
      : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }),
  });

/** "3 Antworten · zuletzt 10:42", with who answered; opens the thread. */
const RepliesLine = ({
  message,
  fresh,
  nameOf,
  onOpen,
}: {
  message: Message;
  fresh: boolean;
  nameOf: (id: string) => string;
  onOpen: () => void;
}) => {
  const replies = message.replies!;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex max-w-full items-center gap-2 rounded-lg py-1 pr-2 text-left text-[13px] hover:bg-hover md:-ml-1 md:pl-1"
    >
      <span className="flex shrink-0 gap-0.5">
        {replies.people.slice(0, 3).map((id) => (
          <ColleagueAvatar key={id} id={id} name={nameOf(id)} size={22} />
        ))}
      </span>
      <span className="font-medium text-accent">
        {replies.count === 1 ? m.chat_replies_one() : m.chat_replies({ count: replies.count })}
      </span>
      <span className="truncate text-muted">
        {m.chat_replies_last({ when: replyTime(replies.lastAt) })}
      </span>
      {fresh ? (
        <span className="shrink-0 rounded-full bg-accent-fill px-1.5 text-[11px] font-medium text-white">
          {m.chat_new_badge()}
        </span>
      ) : null}
    </button>
  );
};

/** Changing one's message in place: Enter saves, Escape leaves it as it was. */
const EditField = ({
  message,
  people,
  onSave,
  onCancel,
}: {
  message: Message;
  people: Person[];
  onSave: (text: string, mentions: string[]) => void;
  onCancel: () => void;
}) => {
  const [text, setText] = useState(message.text);
  const save = () => {
    const value = text.trim();
    if (!value) return;
    if (value === message.text) return onCancel();
    const mentioned = people.filter((person) => message.mentions.includes(person.id));
    onSave(value, keptMentions(value, mentioned));
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
    }
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      save();
    }
  };
  return (
    <div className="flex w-full max-w-[640px] flex-col gap-1.5">
      <textarea
        aria-label={m.chat_edit_message()}
        value={text}
        autoFocus
        onFocus={(event) => event.currentTarget.setSelectionRange(text.length, text.length)}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={onKeyDown}
        className="field-sizing-content min-h-11 w-full resize-none rounded-xl border border-border bg-bg px-3 py-2 text-[15px] text-fg outline-none focus:border-muted md:text-[14px]"
      />
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          {m.chat_cancel()}
        </Button>
        <Button variant="primary" size="sm" disabled={!text.trim()} onClick={save}>
          {m.chat_save()}
        </Button>
      </div>
    </div>
  );
};

/** The message itself: its text as a bubble (phone) or a line (desktop), or what stands for it. */
const Body = ({
  message,
  own,
  me,
  people,
}: {
  message: Shown;
  own: boolean;
  me: string;
  people: Person[];
}) => {
  if (message.call) return <CallLine call={message.call} channelId={message.channelId} own={own} />;
  if (message.deleted)
    return (
      <p className="m-0 rounded-2xl border border-dashed border-border px-3 py-1.5 text-[14px] text-muted italic md:border-0 md:p-0">
        {m.chat_message_deleted()}
      </p>
    );
  if (message.sealed && message.sealed !== "valid" && message.sealed !== "invalid")
    return <SealedLine state={message.sealed} />;
  if (!message.text) return null;
  return (
    <div
      className={cn(
        "max-w-[85vw] rounded-2xl px-3 py-2 md:max-w-none md:rounded-none md:bg-transparent md:p-0 md:text-fg",
        own ? "rounded-br-md bg-primary text-onprimary" : "rounded-bl-md bg-subtle",
      )}
    >
      <MessageText message={message} people={people} me={me} own={own} />
    </div>
  );
};

/** What one can do with this message: none while it is being sent or after it was deleted. */
const useActions = (
  message: Message,
  stored: Message,
  own: boolean,
  {
    onMakeTask,
    onEdit,
    onDelete,
    onReact,
    onReply,
  }: Pick<Props, "onMakeTask" | "onDelete" | "onReact" | "onReply"> & { onEdit: () => void },
): MessageActions => {
  const copy = useCopyText();
  if (isPending(message) || message.deleted) return {};
  const reacts = !message.call;
  return {
    onReact: reacts ? (emoji) => onReact(message, emoji) : undefined,
    onReply: reacts && onReply ? () => onReply(message) : undefined,
    onCopy: message.text ? () => copy(message.text) : undefined,
    onMakeTask: () => onMakeTask(stored),
    onEdit: own && message.text ? onEdit : undefined,
    onDelete: own ? () => onDelete(message) : undefined,
  };
};

const Item = ({
  message: stored,
  own,
  me,
  people,
  nameOf,
  highlight,
  readUpTo = null,
  onReply,
  ...handlers
}: { message: Message; own: boolean } & Omit<Props, "run">) => {
  // In a confidential channel: the text as opened here; what leaves the chat (a task) is told
  // only that there was a message.
  const message = useOpened(stored);
  const sealedUrls = useSealedUrls(message.files, Boolean(message.sealed));
  const { tasks } = useTasks();
  const statusLabel = useStatusLabel();
  const made = tasksOfMessage(tasks, message.id);
  const [editing, setEditing] = useState(false);
  const [sheet, setSheet] = useState(false);
  const phone = useMediaQuery("(max-width: 767px)");
  const actions = useActions(message, stored, own, {
    ...handlers,
    onReply,
    onEdit: () => setEditing(true),
  });
  const hasActions = Object.values(actions).some(Boolean);
  const press = useLongPress(() => {
    navigator.vibrate?.(10);
    setSheet(true);
  });
  // Armed only where it opens the sheet: elsewhere (a tablet, the field while editing) the long
  // press stays the browser's (select, paste, a link's menu) and a slow tap stays a tap.
  const pressable = phone && !editing && hasActions;
  return (
    <>
      <div
        data-message={message.id}
        {...(pressable ? press.handlers : {})}
        // The click that ends a long press would also follow a link or play a voice message.
        onClickCapture={(event) => {
          if (!press.consumeClick()) return;
          event.preventDefault();
          event.stopPropagation();
        }}
        className={cn(
          "group relative flex max-w-full flex-col gap-1.5 rounded-xl transition-colors duration-700 hover:duration-100 md:-mx-2 md:px-2 md:py-0.5 md:hover:bg-hover/60",
          // A long press picks the message, not a word of it (copying is in the sheet).
          "max-md:select-none max-md:[-webkit-touch-callout:none]",
          own ? "items-end md:items-stretch" : "items-start md:items-stretch",
          highlight === message.id && "bg-accent/10",
          sheet && "bg-hover",
          isPending(message) && "opacity-60",
        )}
      >
        {editing ? (
          <EditField
            message={message}
            people={people}
            onCancel={() => setEditing(false)}
            onSave={(text, mentions) => {
              handlers.onEdit(message, text, mentions);
              setEditing(false);
            }}
          />
        ) : (
          <Body message={message} own={own} me={me} people={people} />
        )}
        {message.sealed === "invalid" ? <ForgedNote /> : null}
        <MessageFiles files={message.files} urls={message.sealed ? sealedUrls : undefined} />
        {message.cards.map((card) => (
          <MessageCard key={`${card.kind}-${card.ref}`} card={card} />
        ))}
        <ReactionBar
          message={message}
          me={me}
          nameOf={nameOf}
          onReact={(emoji) => handlers.onReact(message, emoji)}
        />
        {message.replies && onReply ? (
          <RepliesLine
            message={message}
            nameOf={nameOf}
            fresh={hasNewReplies(message, me, readUpTo)}
            onOpen={() => onReply(message)}
          />
        ) : null}
        {made.map((task) => (
          <ItemLink
            key={task.id}
            item={{ kind: "task", accountId: task.accountId, ref: task.id }}
            className="flex items-center gap-1.5 text-[12px] text-muted no-underline hover:text-fg"
          >
            <ListChecks size={13} aria-hidden="true" />
            {m.chat_task_made({ title: task.title, status: statusLabel(task) })}
          </ItemLink>
        ))}
        {editing || !hasActions ? null : (
          <>
            <HoverBar actions={actions} />
            {/* A screen reader on a phone reaches the sheet without the long press. */}
            <button
              type="button"
              aria-label={m.chat_message_actions()}
              onClick={() => setSheet(true)}
              className="sr-only md:hidden"
            />
          </>
        )}
      </div>
      {/* Beside the message, not in it: React passes the sheet's events up to its parents, and a
        slow tap on a choice would be the message's long press. */}
      {pressable ? <ActionSheet open={sheet} onOpenChange={setSheet} actions={actions} /> : null}
    </>
  );
};

export const Run = ({ run, ...rest }: Props) => {
  const { nameOf } = rest;
  const own = run.authorId === rest.me;
  const name = nameOf(run.authorId);
  return (
    <li className={cn("flex gap-3", own && "justify-end md:justify-start")}>
      <ColleagueAvatar id={run.authorId} name={name} size={34} className="hidden md:inline-flex" />
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-1 md:items-stretch",
          own ? "items-end" : "items-start",
        )}
      >
        <span className="text-[12px] text-muted md:text-[14px]">
          <span className={cn("font-semibold text-fg", own && "hidden md:inline")}>
            {firstName(name)}
          </span>
          <span className={cn(own && "hidden md:inline")}> · </span>
          <time dateTime={run.createdAt} className="md:font-mono md:text-[12px]">
            {time(run.createdAt)}
          </time>
        </span>
        {run.messages.map((message) => (
          <Item key={message.id} message={message} own={own} {...rest} />
        ))}
      </div>
    </li>
  );
};
