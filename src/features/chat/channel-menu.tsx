/**
 * A channel's menu: mute it for oneself, go on confidentially (a new end-to-end encrypted
 * conversation with the same people; what was written stays where it is), leave a named channel,
 * delete one's own.
 */
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff, Ellipsis, LockKeyhole, LogOut, Trash2 } from "lucide-react";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import type { ChannelSummary } from "@/lib/chat";
import { m } from "@/paraglide/messages";
import { useChatActions } from "./queries";

export const ChannelMenu = ({
  channel,
  me,
  title,
}: {
  channel: ChannelSummary;
  me: string;
  title: string;
}) => {
  const actions = useChatActions(me);
  const navigate = useNavigate();
  const toast = useToast();
  const away = () => void navigate({ to: "/chat", search: {} });
  const run = async (work: () => Promise<unknown>, done: string) => {
    try {
      await work();
      toast.show(done);
      away();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
  const canGoConfidential =
    !channel.confidential && (channel.kind === "channel" || channel.kind === "direct");
  /** The confidential one, and a line here that leads there (only the members can open it). */
  const goConfidential = async () => {
    if (!window.confirm(m.chat_go_confidential_confirm())) return;
    try {
      const others = channel.members.filter((member) => member !== me);
      const next =
        channel.kind === "direct"
          ? await actions.openDirect.mutateAsync({ members: others, confidential: true })
          : await actions.createChannel.mutateAsync({
              name: channel.name ?? title,
              members: others,
              confidential: true,
            });
      const link = `${window.location.origin}/chat?channel=${encodeURIComponent(next.id)}`;
      await actions.post.mutateAsync({
        channelId: channel.id,
        text: m.chat_go_confidential_note({ link }),
        mentions: [],
        cards: [],
        files: [],
      });
      void navigate({ to: "/chat", search: { channel: next.id } });
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };
  return (
    <MenuRoot>
      <MenuTrigger
        aria-label={m.chat_channel_menu()}
        className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-hover hover:text-fg"
      >
        <Ellipsis size={16} />
      </MenuTrigger>
      <MenuContent align="end">
        <MenuItem
          onSelect={() => actions.mute.mutate({ channelId: channel.id, muted: !channel.muted })}
        >
          {channel.muted ? <Bell size={15} /> : <BellOff size={15} />}
          {channel.muted ? m.chat_unmute() : m.chat_mute()}
        </MenuItem>
        {canGoConfidential ? (
          <MenuItem onSelect={() => void goConfidential()}>
            <LockKeyhole size={15} /> {m.chat_go_confidential()}
          </MenuItem>
        ) : null}
        {channel.kind === "channel" ? (
          <MenuItem
            onSelect={() => {
              if (!window.confirm(m.chat_leave_confirm({ name: title }))) return;
              void run(() => actions.leave.mutateAsync(channel.id), m.chat_left({ name: title }));
            }}
          >
            <LogOut size={15} /> {m.chat_leave()}
          </MenuItem>
        ) : null}
        {channel.kind === "channel" && channel.createdBy === me ? (
          <MenuItem
            className="text-danger"
            onSelect={() => {
              if (!window.confirm(m.chat_delete_channel_confirm({ name: title }))) return;
              void run(
                () => actions.removeChannel.mutateAsync(channel.id),
                m.chat_channel_deleted({ name: title }),
              );
            }}
          >
            <Trash2 size={15} /> {m.chat_delete_channel()}
          </MenuItem>
        ) : null}
      </MenuContent>
    </MenuRoot>
  );
};
