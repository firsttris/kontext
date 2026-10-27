/**
 * Messages of one person close together: on a desktop under one name with the avatar, on a phone
 * as bubbles (the own on the right). Each message shows its text, photos, files and cards, the
 * tasks made from it, its reactions and answers, and its actions.
 */
import { Ellipsis, ListChecks, MessageSquareReply, Pencil, Trash2 } from "lucide-react";
import { type KeyboardEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { CallLine } from "@/features/calls/call-line";
import { ItemLink } from "@/features/links/item-link";
import { ColleagueAvatar } from "@/features/photos/colleague-avatar";
import { useStatusLabel, useTasks } from "@/features/tasks/queries";
import { firstName, keptMentions, type Message, type MessageRun, type Person } from "@/lib/chat";
import { tasksOfMessage } from "@/lib/chat-cards";
import { hasNewReplies } from "@/lib/chat-threads";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { ForgedNote, SealedLine, useOpened, useSealedUrls } from "./confidential";
import { MessageCard } from "./message-card";
import { MessageFiles } from "./message-files";
import { MessageText } from "./message-text";
import { ReactionBar, ReactionPicker } from "./reactions";

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

const hoverButton =
  "flex size-7 shrink-0 items-center justify-center rounded-md text-muted opacity-60 hover:bg-hover hover:text-fg focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:data-[state=open]:opacity-100";

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
        <span className="shrink-0 rounded-full bg-accent px-1.5 text-[11px] font-medium text-white">
          {m.chat_new_badge()}
        </span>
      ) : null}
    </button>
  );
};

const Actions = ({
  message,
  own,
  onMakeTask,
  onEdit,
  onDelete,
}: {
  message: Message;
  own: boolean;
  onMakeTask: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) =>
  isPending(message) || message.deleted ? null : (
    <MenuRoot>
      <MenuTrigger
        aria-label={m.chat_message_actions()}
        className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted opacity-60 hover:bg-hover hover:text-fg focus-visible:opacity-100 md:opacity-0 md:group-hover:opacity-100 md:data-[state=open]:opacity-100"
      >
        <Ellipsis size={15} />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem onSelect={onMakeTask}>
          <ListChecks size={15} /> {m.chat_make_task()}
        </MenuItem>
        {own && message.text ? (
          <MenuItem onSelect={onEdit}>
            <Pencil size={15} /> {m.chat_edit_message()}
          </MenuItem>
        ) : null}
        {own ? (
          <MenuItem onSelect={onDelete} className="text-danger">
            <Trash2 size={15} /> {m.chat_delete_message()}
          </MenuItem>
        ) : null}
      </MenuContent>
    </MenuRoot>
  );

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

const Item = ({
  message: stored,
  own,
  me,
  people,
  nameOf,
  highlight,
  readUpTo = null,
  onMakeTask,
  onEdit,
  onDelete,
  onReact,
  onReply,
}: { message: Message; own: boolean } & Omit<Props, "run">) => {
  // In a confidential channel: the text as opened here; what leaves the chat (a task) is told
  // only that there was a message.
  const message = useOpened(stored);
  const sealedUrls = useSealedUrls(message.files, Boolean(message.sealed));
  const live = !isPending(message) && !message.deleted && !message.call;
  const { tasks } = useTasks();
  const statusLabel = useStatusLabel();
  const made = tasksOfMessage(tasks, message.id);
  const [editing, setEditing] = useState(false);
  return (
    <div
      data-message={message.id}
      className={cn(
        "group flex max-w-full flex-col gap-1.5 rounded-xl transition-colors duration-700 md:-mx-2 md:px-2 md:py-0.5",
        own ? "items-end md:items-stretch" : "items-start md:items-stretch",
        highlight === message.id && "bg-accent/10",
        isPending(message) && "opacity-60",
      )}
    >
      <div
        className={cn("flex max-w-full items-start gap-1", own && "flex-row-reverse md:flex-row")}
      >
        {editing ? (
          <EditField
            message={message}
            people={people}
            onCancel={() => setEditing(false)}
            onSave={(text, mentions) => {
              onEdit(message, text, mentions);
              setEditing(false);
            }}
          />
        ) : message.call ? (
          <CallLine call={message.call} channelId={message.channelId} own={own} />
        ) : message.deleted ? (
          <p className="m-0 rounded-2xl border border-dashed border-border px-3 py-1.5 text-[14px] text-muted italic md:border-0 md:p-0">
            {m.chat_message_deleted()}
          </p>
        ) : message.sealed && message.sealed !== "valid" && message.sealed !== "invalid" ? (
          <SealedLine state={message.sealed} />
        ) : message.text ? (
          <div
            className={cn(
              "max-w-[85vw] rounded-2xl px-3 py-2 md:max-w-none md:flex-1 md:rounded-none md:bg-transparent md:p-0 md:text-fg",
              own ? "rounded-br-md bg-primary text-onprimary" : "rounded-bl-md bg-subtle",
            )}
          >
            <MessageText message={message} people={people} me={me} own={own} />
          </div>
        ) : (
          <span className="hidden flex-1 md:block" />
        )}
        {editing || !live ? null : (
          <>
            <ReactionPicker onPick={(emoji) => onReact(message, emoji)} className={hoverButton} />
            {onReply ? (
              <button
                type="button"
                aria-label={m.chat_reply()}
                title={m.chat_reply()}
                onClick={() => onReply(message)}
                className={hoverButton}
              >
                <MessageSquareReply size={15} />
              </button>
            ) : null}
          </>
        )}
        {editing ? null : (
          <Actions
            message={message}
            own={own}
            onMakeTask={() => onMakeTask(stored)}
            onEdit={() => setEditing(true)}
            onDelete={() => onDelete(message)}
          />
        )}
      </div>
      {message.sealed === "invalid" ? <ForgedNote /> : null}
      <MessageFiles files={message.files} urls={message.sealed ? sealedUrls : undefined} />
      {message.cards.map((card) => (
        <MessageCard key={`${card.kind}-${card.ref}`} card={card} />
      ))}
      <ReactionBar
        message={message}
        me={me}
        nameOf={nameOf}
        onReact={(emoji) => onReact(message, emoji)}
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
    </div>
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
