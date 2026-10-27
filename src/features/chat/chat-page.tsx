/**
 * The chat: channels and direct conversations | the open one. On a phone one screen at a time,
 * chosen by the URL: the list with the tab bar, or the conversation.
 */
import { useNavigate } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { useState } from "react";
import { TabBar } from "@/components/shell/app-shell";
import { FROM_PARENT } from "@/components/use-back";
import type { Channel } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { ChannelScreen, ChannelSidebar } from "./channel-list";
import { ChatDialog } from "./chat-dialog";
import { Conversation } from "./conversation";
import { useChannels, useChatActions } from "./queries";
import { useChatNames } from "./use-chat-names";

type Editing = { channel?: Channel } | null;

export const ChatPage = ({
  channelId,
  messageId,
  threadId,
}: {
  channelId?: string;
  messageId?: string;
  threadId?: string;
}) => {
  const navigate = useNavigate();
  const { channels, online, isPending } = useChannels();
  const { me, people } = useChatNames();
  const actions = useChatActions(me);
  const [editing, setEditing] = useState<Editing>(null);
  const open = channels.find((channel) => channel.id === channelId);
  // Started from the list (a phone's "Neue Nachricht"): "Zurück" leads there.
  const show = (channel: Channel) =>
    void navigate({ to: "/chat", search: { channel: channel.id }, state: FROM_PARENT });

  return (
    <>
      <div className="hidden h-full w-[260px] shrink-0 flex-col border-r border-border bg-side md:flex">
        <ChannelSidebar
          channels={channels}
          online={online}
          activeId={open?.id}
          onNew={() => setEditing({})}
        />
      </div>
      <div className={cn("h-full w-full flex-col md:hidden", channelId ? "hidden" : "flex")}>
        <ChannelScreen channels={channels} online={online} onNew={() => setEditing({})} />
        <TabBar />
      </div>
      <main className={cn("h-full min-w-0 flex-1 flex-col", channelId ? "flex" : "hidden md:flex")}>
        {open ? (
          <Conversation
            key={open.id}
            channel={open}
            online={online}
            messageId={messageId}
            threadId={threadId}
            onEdit={() => setEditing({ channel: open })}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[14px] text-muted">
            <MessagesSquare size={28} strokeWidth={1.5} aria-hidden="true" />
            {isPending ? m.chat_loading() : channelId ? m.chat_unknown() : m.chat_pick()}
          </div>
        )}
      </main>
      {editing ? (
        <ChatDialog
          people={people}
          me={me}
          channel={editing.channel}
          onClose={() => setEditing(null)}
          onDirect={(members, confidential) =>
            actions.openDirect.mutateAsync({ members, confidential })
          }
          onCreate={(name, members, confidential) =>
            actions.createChannel.mutateAsync({ name, members, confidential })
          }
          onUpdate={(id, name, members) => actions.updateChannel.mutateAsync({ id, name, members })}
          onOpen={show}
        />
      ) : null}
    </>
  );
};
