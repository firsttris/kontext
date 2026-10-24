/**
 * One channel or direct conversation: the history (a list with names on a desktop, bubbles on a
 * phone), a line where the new messages begin, who is writing, and the field to write – with
 * photos and files (also dropped onto the conversation) and cards. What one sees counts as read.
 */
import { Link } from "@tanstack/react-router";
import { BellOff, ChevronLeft, ImageUp, Users } from "lucide-react";
import { type DragEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useMediaQuery } from "@/components/use-media-query";
import { TaskDialog, type TaskStart } from "@/features/tasks/task-dialog";
import { type ChannelSummary, firstName, type Message, readBy, timeline } from "@/lib/chat";
import { taskFromMessage } from "@/lib/chat-cards";
import { m } from "@/paraglide/messages";
import { ChannelMenu } from "./channel-menu";
import { MessageInput } from "./message-input";
import { isPending, Run } from "./message-run";
import { useChatActions, useMessages } from "./queries";
import { useTyping } from "./typing";
import { useAttachments } from "./use-attachments";
import { useChatNames } from "./use-chat-names";

const subtitle = (
  channel: ChannelSummary,
  me: string,
  nameOf: (id: string) => string,
  online: string[],
) => {
  if (channel.kind === "team") return m.chat_team_everyone();
  if (channel.kind === "mailbox") return m.chat_mailbox_everyone();
  const others = channel.members.filter((member) => member !== me);
  if (channel.kind === "direct" && others.length === 1) {
    return online.includes(others[0]!) ? m.chat_online() : "";
  }
  return [me, ...others].map((id) => (id === me ? m.chat_you() : firstName(nameOf(id)))).join(", ");
};

const typingLine = (names: string[]) =>
  names.length === 1
    ? m.chat_typing_one({ name: names[0]! })
    : m.chat_typing_many({ names: names.join(", ") });

/** Dragged in from the desktop: files, not text or links. */
const carriesFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

export const Conversation = ({
  channel,
  online,
  messageId,
  onEdit,
}: {
  channel: ChannelSummary;
  online: string[];
  /** A message to show, e.g. the one a task was made from. */
  messageId?: string;
  onEdit: () => void;
}) => {
  const { me, people, nameOf, titleOf } = useChatNames();
  const {
    messages,
    reads,
    isPending: loading,
    hasOlder,
    loadOlder,
    loadingOlder,
  } = useMessages(channel.id);
  const actions = useChatActions(me);
  const typing = useTyping(channel.id);
  const title = titleOf(channel);
  const desktop = useMediaQuery("(min-width: 768px)");
  const prefix = channel.kind === "direct" ? "" : channel.kind === "mailbox" ? "" : "# ";

  // Where the new messages began when the channel was opened; stays while one reads.
  const [readUpTo] = useState(channel.readAt);

  // Read: the newest message, whenever it is on screen in a visible tab.
  const newest = messages.filter((message) => !isPending(message)).at(-1);
  const markRead = actions.markRead.mutate;
  useEffect(() => {
    if (!newest) return;
    const mark = () => {
      if (document.visibilityState !== "visible") return;
      if (channel.readAt && channel.readAt >= newest.createdAt) return;
      markRead({ channelId: channel.id, at: newest.createdAt });
    };
    mark();
    document.addEventListener("visibilitychange", mark);
    return () => document.removeEventListener("visibilitychange", mark);
  }, [newest, channel.id, channel.readAt, markRead]);

  // Stay at the bottom while one is there; keep the place when older messages come in above.
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const heightBefore = useRef<number | null>(null);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || messages.length === 0) return;
    if (heightBefore.current !== null) {
      element.scrollTop += element.scrollHeight - heightBefore.current;
      heightBefore.current = null;
    } else if (atBottom.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [messages.length]);
  const older = () => {
    heightBefore.current = scroller.current?.scrollHeight ?? null;
    loadOlder();
  };

  // A message asked for in the URL: load older pages until it is there, then show and mark it.
  const [highlight, setHighlight] = useState<string>();
  const shown = useRef<string | null>(null);
  const pagesLoaded = useRef(0);
  useEffect(() => {
    if (!messageId || shown.current === messageId || loading) return;
    const element = scroller.current?.querySelector(`[data-message="${CSS.escape(messageId)}"]`);
    if (element) {
      shown.current = messageId;
      atBottom.current = false;
      element.scrollIntoView({ block: "center" });
      setHighlight(messageId);
      const fade = setTimeout(() => setHighlight(undefined), 2500);
      return () => clearTimeout(fade);
    }
    // At most ten pages back; a removed message is not searched for in the whole history.
    if (hasOlder && !loadingOlder && pagesLoaded.current < 10) {
      pagesLoaded.current += 1;
      older();
    }
  });

  const attachments = useAttachments(channel.id);
  const [dragging, setDragging] = useState(false);
  const [task, setTask] = useState<TaskStart | null>(null);
  const makeTask = (message: Message) => {
    const { title: taskTitle, link } = taskFromMessage(message, `${prefix}${title}`);
    // From the channel of a shared mailbox the task goes on its board, else on one's own.
    setTask({
      title: taskTitle,
      link,
      accountId: channel.kind === "mailbox" ? channel.accountId! : me,
    });
  };

  // In a direct conversation: who has read my last message.
  const mine = [...messages].reverse().find((message) => message.authorId === me);
  const seenBy =
    channel.kind === "direct" && mine && !isPending(mine) && mine === messages.at(-1)
      ? readBy(mine, reads)
      : [];
  const others = channel.members.filter((member) => member !== me);

  const items = timeline(messages, new Date(), { me, readUpTo });
  // Only who is in the conversation can be mentioned; #allgemein and mailboxes have everyone.
  const mentionable =
    channel.kind === "channel" || channel.kind === "direct"
      ? people.filter((person) => channel.members.includes(person.id))
      : people;

  return (
    <section
      aria-label={title}
      className="relative flex h-full min-h-0 flex-1 flex-col"
      onDragOver={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        attachments.addFiles(event.dataTransfer.files);
      }}
    >
      {dragging ? (
        <div className="pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-accent bg-bg/90 text-[15px] font-medium text-accent">
          <ImageUp size={28} aria-hidden="true" />
          {m.chat_drop_here({ name: `${prefix}${title}` })}
        </div>
      ) : null}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border px-2 md:gap-3 md:px-5">
        <Link
          to="/chat"
          search={{}}
          aria-label={m.chat_back()}
          className="flex size-11 items-center justify-center text-fg md:hidden"
        >
          <ChevronLeft size={20} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col md:flex-row md:items-baseline md:gap-3">
          <h1 className="m-0 truncate text-[16px] font-semibold md:text-[17px]">
            {prefix}
            {title}
          </h1>
          {channel.muted ? (
            <BellOff
              size={14}
              role="img"
              aria-label={m.chat_muted()}
              className="hidden shrink-0 text-muted md:block"
            />
          ) : null}
          <span className="truncate text-[12px] text-muted">
            {subtitle(channel, me, nameOf, online)}
          </span>
        </div>
        {channel.kind === "channel" ? (
          <Button
            variant="ghost"
            size="iconSm"
            aria-label={m.chat_edit()}
            title={m.chat_edit()}
            onClick={onEdit}
          >
            <Users size={16} />
          </Button>
        ) : null}
        <ChannelMenu channel={channel} me={me} title={`${prefix}${title}`} />
      </header>
      <div
        ref={scroller}
        onScroll={(event) => {
          const element = event.currentTarget;
          atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3.5 py-4 md:px-6"
      >
        {hasOlder ? (
          <div className="flex justify-center pb-3">
            <Button variant="ghost" size="sm" disabled={loadingOlder} onClick={older}>
              {m.chat_older()}
            </Button>
          </div>
        ) : null}
        {!loading && messages.length === 0 ? (
          <p className="m-0 py-10 text-center text-[14px] text-muted">{m.chat_empty()}</p>
        ) : null}
        <ol
          aria-label={m.chat_messages()}
          className="m-0 flex list-none flex-col gap-3.5 p-0 md:gap-4"
        >
          {items.map((item) => {
            if (item.kind === "day") {
              return (
                <li
                  key={item.key}
                  className="flex items-center gap-2.5 text-[12px] text-muted before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
                >
                  {item.label}
                </li>
              );
            }
            if (item.kind === "new") {
              return (
                <li
                  key={item.key}
                  className="flex items-center gap-2.5 text-[12px] font-medium text-accent after:h-px after:flex-1 after:bg-accent/40"
                >
                  {m.chat_new_badge()}
                </li>
              );
            }
            return (
              <Run
                key={item.messages[0]!.id}
                run={item}
                me={me}
                people={people}
                nameOf={nameOf}
                highlight={highlight}
                onMakeTask={makeTask}
                onEdit={(message, text, mentions) =>
                  actions.edit.mutate({ id: message.id, text, mentions })
                }
                onDelete={(message) => {
                  if (window.confirm(m.chat_delete_message_confirm())) {
                    actions.remove.mutate(message.id);
                  }
                }}
              />
            );
          })}
        </ol>
        {seenBy.length ? (
          <p className="m-0 mt-1 text-right text-[11px] text-muted md:text-left md:pl-[46px]">
            {others.length === 1
              ? m.chat_seen()
              : m.chat_seen_by({ names: seenBy.map((id) => firstName(nameOf(id))).join(", ") })}
          </p>
        ) : null}
      </div>
      <div className="flex h-6 shrink-0 items-center gap-2 px-4 text-[13px] text-muted md:px-6 md:pl-[70px]">
        {typing.length ? (
          <>
            <span aria-hidden="true" className="size-1.5 animate-pulse rounded-full bg-accent" />
            {typingLine(typing.map((id) => firstName(nameOf(id))))}
          </>
        ) : null}
      </div>
      <div className="shrink-0 border-t border-border px-2.5 pt-2 pb-3 safe-bottom md:border-0 md:px-5 md:pt-0 md:pb-4">
        <MessageInput
          key={channel.id}
          placeholder={
            desktop ? m.chat_placeholder({ name: `${prefix}${title}` }) : m.chat_placeholder_short()
          }
          people={mentionable}
          me={me}
          onTyping={() => actions.typing(channel.id)}
          attachments={attachments}
          onSend={(text, mentions) => {
            atBottom.current = true;
            actions.post.mutate({
              channelId: channel.id,
              text,
              mentions,
              cards: attachments.cards,
              files: attachments.files.flatMap((file) => (file.uploaded ? [file.uploaded] : [])),
            });
            attachments.clear();
          }}
        />
      </div>
      {task ? <TaskDialog start={task} onClose={() => setTask(null)} /> : null}
    </section>
  );
};
