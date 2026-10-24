/**
 * "Über diese Mail sprechen": a message to a channel or a colleague with the mail as a card,
 * instead of forwarding it internally. The mail stays where it is; whoever may open its mailbox
 * opens it from the card. Suggested first: where it was already discussed, where its sender came
 * up before, the channel of its mailbox.
 */
import { AtSign, Hash, Search } from "lucide-react";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { EmailSummary } from "@/jmap/types";
import type { ChannelSummary, Person } from "@/lib/chat";
import { mailCard } from "@/lib/chat-cards";
import { cn } from "@/lib/cn";
import { m } from "@/paraglide/messages";
import { MessageCard } from "./message-card";
import { MessageInput } from "./message-input";
import { useChannels, useChatActions, useDiscussions, useSuggestions } from "./queries";
import { useChatNames } from "./use-chat-names";

type Target =
  | { kind: "channel"; channel: ChannelSummary; why?: string }
  | { kind: "person"; person: Person };

const targetKey = (target: Target) =>
  target.kind === "channel" ? target.channel.id : `person-${target.person.id}`;

/** Suggestions first, then every other channel, then the colleagues. */
const useTargets = (accountId: string, email: EmailSummary): Target[] => {
  const { channels } = useChannels();
  const { me, people } = useChatNames();
  const discussed = useDiscussions(email.id, email.threadId ?? null).map((d) => d.channelId);
  const sameSender = useSuggestions(email.from?.[0]?.email ?? "");
  const mailbox = channels.find((c) => c.kind === "mailbox" && c.accountId === accountId)?.id;
  const reasons: [string | undefined, () => string][] = [
    ...discussed.map((id) => [id, m.chat_why_discussed] as [string, () => string]),
    ...sameSender.map((id) => [id, m.chat_why_sender] as [string, () => string]),
    [mailbox, m.chat_why_mailbox],
  ];
  const suggested: Target[] = [];
  for (const [id, why] of reasons) {
    const channel = channels.find((c) => c.id === id);
    if (channel && !suggested.some((t) => targetKey(t) === channel.id)) {
      suggested.push({ kind: "channel", channel, why: why() });
    }
  }
  const rest = channels
    .filter((c) => c.kind !== "direct" && !suggested.some((t) => targetKey(t) === c.id))
    .map((channel): Target => ({ kind: "channel", channel }));
  const colleagues = people
    .filter((person) => person.id !== me)
    .map((person): Target => ({ kind: "person", person }));
  return [...suggested, ...rest, ...colleagues];
};

export const DiscussDialog = ({
  accountId,
  email,
  onClose,
}: {
  accountId: string;
  email: EmailSummary;
  onClose: () => void;
}) => {
  const toast = useToast();
  const { me, people, titleOf } = useChatNames();
  const actions = useChatActions(me);
  const targets = useTargets(accountId, email);
  const [filter, setFilter] = useState("");
  const [chosen, setChosen] = useState<string | null>(null);
  const card = mailCard(accountId, email);

  const label = (target: Target) =>
    target.kind === "person"
      ? target.person.name
      : `${target.channel.kind === "mailbox" ? "" : "#"}${titleOf(target.channel)}`;
  const shown = targets.filter((target) =>
    label(target).toLocaleLowerCase("de-DE").includes(filter.toLocaleLowerCase("de-DE")),
  );
  const target = targets.find((t) => targetKey(t) === chosen) ?? (filter ? shown[0] : targets[0]);

  const send = async (text: string, mentions: string[]) => {
    if (!target) return;
    try {
      const channelId =
        target.kind === "channel"
          ? target.channel.id
          : (await actions.openDirect.mutateAsync([target.person.id])).id;
      await actions.post.mutateAsync({ channelId, text, mentions, cards: [card], files: [] });
      toast.show(m.chat_discuss_sent({ name: label(target) }));
      onClose();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()} title={m.chat_discuss_title()}>
      <div className="flex flex-col gap-1.5">
        <label className="flex h-10 items-center gap-2 rounded-[9px] border border-border px-3 text-muted focus-within:border-muted">
          <Search size={15} aria-hidden="true" />
          <span className="sr-only">{m.chat_discuss_to()}</span>
          <input
            value={filter}
            placeholder={m.chat_discuss_to()}
            onChange={(event) => {
              setFilter(event.target.value);
              setChosen(null);
            }}
            className="flex-1 bg-transparent text-[14px] text-fg outline-none"
          />
        </label>
        <fieldset className="m-0 flex max-h-48 flex-col gap-px overflow-y-auto border-0 p-0">
          <legend className="sr-only">{m.chat_discuss_to()}</legend>
          {shown.map((option) => {
            const on = Boolean(target && targetKey(option) === targetKey(target));
            return (
              <label
                key={targetKey(option)}
                className={cn(
                  "flex h-10 shrink-0 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-[14px] has-focus-visible:outline-2",
                  on ? "bg-subtle font-medium" : "text-muted hover:bg-hover",
                )}
              >
                <input
                  type="radio"
                  name="discuss-target"
                  className="sr-only"
                  checked={on}
                  onChange={() => setChosen(targetKey(option))}
                />
                {option.kind === "person" ? (
                  <Avatar name={option.person.name} size={22} />
                ) : option.channel.kind === "mailbox" ? (
                  <AtSign size={15} className="text-muted" aria-hidden="true" />
                ) : (
                  <Hash size={15} className="text-muted" aria-hidden="true" />
                )}
                <span className="flex-1 truncate text-fg">{label(option)}</span>
                {option.kind === "channel" && option.why ? (
                  <span className="text-[12px] font-normal text-muted">{option.why}</span>
                ) : null}
              </label>
            );
          })}
        </fieldset>
      </div>
      <MessageCard card={card} />
      <p className="m-0 text-[12px] leading-normal text-muted">{m.chat_discuss_hint()}</p>
      <MessageInput
        placeholder={m.chat_discuss_placeholder()}
        people={people}
        me={me}
        allowEmpty
        autoFocus
        onTyping={() => undefined}
        onSend={(text, mentions) => void send(text, mentions)}
      />
    </Dialog>
  );
};
