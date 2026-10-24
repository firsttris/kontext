/** A channel's menu: mute it for oneself, leave a named channel, delete one's own. */
import { useNavigate } from "@tanstack/react-router";
import { Bell, BellOff, Ellipsis, LogOut, Trash2 } from "lucide-react";
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
