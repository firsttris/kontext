/**
 * The chat's channels: #allgemein, the shared mailboxes and named channels, then the direct
 * conversations. Compact beside the conversation on a desktop; on a phone the whole screen, with
 * the last message of each.
 */
import { Link } from "@tanstack/react-router";
import { AtSign, BellOff, Hash, LockKeyhole, Plus } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { type ChannelSummary, firstName, shortTime, sortChannels, sortDirect } from "@/lib/chat";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { ChatSearchField, ChatSearchResults } from "./chat-search";
import { useChatNames } from "./use-chat-names";

type Props = {
  channels: ChannelSummary[];
  online: string[];
  activeId?: string;
  onNew: () => void;
};

const Badge = ({ channel }: { channel: ChannelSummary }) =>
  channel.muted ? (
    <BellOff size={13} role="img" aria-label={m.chat_muted()} className="shrink-0 text-muted" />
  ) : channel.unread > 0 ? (
    <span
      title={channel.mentions > 0 ? m.chat_mentioned() : undefined}
      className={cn(
        "rounded-full px-1.5 font-mono text-[11px] leading-[18px] text-white",
        channel.mentions > 0 || channel.kind === "direct" ? "bg-accent" : "bg-muted",
      )}
    >
      {channel.unread}
    </span>
  ) : null;

const ChannelIcon = ({ channel, size }: { channel: ChannelSummary; size: number }) =>
  channel.kind === "mailbox" ? (
    <AtSign size={size} strokeWidth={1.75} aria-hidden="true" />
  ) : (
    <Hash size={size} strokeWidth={1.75} aria-hidden="true" />
  );

/** A confidential channel: a small lock after its name. */
const Sealed = ({ channel }: { channel: ChannelSummary }) =>
  channel.confidential ? (
    <LockKeyhole
      size={12}
      role="img"
      aria-label={m.chat_confidential()}
      className="shrink-0 text-muted"
    />
  ) : null;

const PersonIcon = ({ name, online, size }: { name: string; online: boolean; size: number }) => (
  <span className="relative inline-flex">
    <Avatar name={name} size={size} />
    {online ? (
      <span
        role="img"
        aria-label={m.chat_online()}
        className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-bg bg-ok"
      />
    ) : null}
  </span>
);

/** "Du: Danke dir!", "Anna: Herr Lang ruft an"; in a direct conversation the other without name. */
const lastLine = (channel: ChannelSummary, me: string, nameOf: (id: string) => string) => {
  if (!channel.last) return "";
  const { authorId, text } = channel.last;
  if (authorId === me) return `${m.chat_you()}: ${text}`;
  return channel.kind === "direct" ? text : `${firstName(nameOf(authorId))}: ${text}`;
};

const useRows = (channels: ChannelSummary[], online: string[]) => {
  const { me, nameOf, titleOf } = useChatNames();
  const row = (channel: ChannelSummary) => {
    const other = channel.members.find((member) => member !== me) ?? me;
    return {
      channel,
      title: titleOf(channel),
      last: lastLine(channel, me, nameOf),
      person:
        channel.kind === "direct" ? { name: nameOf(other), online: online.includes(other) } : null,
    };
  };
  return {
    named: sortChannels(channels, titleOf).map(row),
    direct: sortDirect(channels).map(row),
  };
};

const sideItem = (active: boolean, unread: boolean) =>
  cn(
    "flex h-8 items-center gap-2 rounded-lg px-2.5 text-[14px] no-underline hover:bg-hover",
    active ? "bg-subtle text-fg" : unread ? "text-fg" : "text-muted",
    (active || unread) && "font-semibold",
  );

/** Beside the conversation, from `md`. */
export const ChannelSidebar = ({ channels, online, activeId, onNew }: Props) => {
  const { named, direct } = useRows(channels, online);
  const [words, setWords] = useState("");
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      <div className="flex flex-col gap-2.5">
        <Button variant="primary" className="h-[38px]" onClick={onNew}>
          <Plus size={15} /> {m.chat_new()}
        </Button>
        <ChatSearchField value={words} onChange={setWords} className="h-9" />
      </div>
      {words ? (
        <ChatSearchResults words={words} />
      ) : (
        <>
          <nav aria-label={m.chat_channels()} className="flex flex-col gap-px">
            <span className="px-2.5 pb-1.5 text-[12px] font-medium text-muted">
              {m.chat_channels()}
            </span>
            {named.map(({ channel, title }) => (
              <Link
                key={channel.id}
                to="/chat"
                search={{ channel: channel.id }}
                aria-current={channel.id === activeId ? "page" : undefined}
                className={sideItem(channel.id === activeId, channel.unread > 0 && !channel.muted)}
              >
                <span className="flex w-3.5 text-muted">
                  <ChannelIcon channel={channel} size={14} />
                </span>
                <span className="flex-1 truncate">{title}</span>
                <Sealed channel={channel} />
                <Badge channel={channel} />
              </Link>
            ))}
          </nav>
          <nav aria-label={m.chat_direct()} className="flex flex-col gap-px">
            <span className="px-2.5 pb-1.5 text-[12px] font-medium text-muted">
              {m.chat_direct()}
            </span>
            {direct.length === 0 ? (
              <span className="px-2.5 text-[13px] text-muted">{m.chat_direct_none()}</span>
            ) : null}
            {direct.map(({ channel, title, person }) => (
              <Link
                key={channel.id}
                to="/chat"
                search={{ channel: channel.id }}
                aria-current={channel.id === activeId ? "page" : undefined}
                className={sideItem(channel.id === activeId, channel.unread > 0 && !channel.muted)}
              >
                <PersonIcon
                  name={person?.name ?? title}
                  online={Boolean(person?.online)}
                  size={22}
                />
                <span className="flex-1 truncate">{title}</span>
                <Sealed channel={channel} />
                <Badge channel={channel} />
              </Link>
            ))}
          </nav>
        </>
      )}
    </div>
  );
};

const PhoneRow = ({ row }: { row: ReturnType<typeof useRows>["named"][number] }) => {
  const { channel, title, last, person } = row;
  const unread = channel.unread > 0;
  return (
    <Link
      to="/chat"
      search={{ channel: channel.id }}
      className="flex items-center gap-3 rounded-xl p-2.5 text-fg no-underline active:bg-hover"
    >
      {person ? (
        <PersonIcon name={person.name} online={person.online} size={42} />
      ) : (
        <span className="flex size-[42px] shrink-0 items-center justify-center rounded-xl bg-subtle text-muted">
          <ChannelIcon channel={channel} size={18} />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-baseline gap-2">
          <span className={cn("flex-1 truncate", unread ? "font-semibold" : "font-medium")}>
            {title}
          </span>
          <Sealed channel={channel} />
          {channel.lastMessageAt ? (
            <span className="font-mono text-[12px] text-muted">
              {shortTime(channel.lastMessageAt)}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          <span className="flex-1 truncate text-[13px] text-muted">{last || " "}</span>
          <Badge channel={channel} />
        </span>
      </span>
    </Link>
  );
};

/** The phone's chat screen. */
export const ChannelScreen = ({ channels, online, onNew }: Props) => {
  const { named, direct } = useRows(channels, online);
  const [words, setWords] = useState("");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-col gap-3.5 px-[18px] pt-5 pb-2.5">
        <div className="flex items-center justify-between">
          <h1 className="m-0 text-[30px] font-semibold tracking-tight">{m.chat_title()}</h1>
          <Button variant="primary" size="icon" aria-label={m.chat_new()} onClick={onNew}>
            <Plus size={18} />
          </Button>
        </div>
        <ChatSearchField value={words} onChange={setWords} className="h-10 rounded-xl" />
      </header>
      {words ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          <ChatSearchResults words={words} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-2 pb-2">
          <span className="px-2.5 pt-2.5 pb-1 text-[12px] font-semibold text-muted">
            {m.chat_channels()}
          </span>
          <nav aria-label={m.chat_channels()} className="flex flex-col">
            {named.map((row) => (
              <PhoneRow key={row.channel.id} row={row} />
            ))}
          </nav>
          <span className="px-2.5 pt-3 pb-1 text-[12px] font-semibold text-muted">
            {m.chat_direct()}
          </span>
          <nav aria-label={m.chat_direct()} className="flex flex-col">
            {direct.length === 0 ? (
              <span className="px-2.5 py-2 text-[14px] text-muted">{m.chat_direct_none()}</span>
            ) : null}
            {direct.map((row) => (
              <PhoneRow key={row.channel.id} row={row} />
            ))}
          </nav>
        </div>
      )}
    </div>
  );
};
