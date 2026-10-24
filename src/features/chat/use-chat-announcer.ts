/**
 * A system notification for a chat message to oneself – in a direct conversation or with an
 * @mention – while Kontext is in the background and notifications are switched on here.
 */
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { showNotification } from "@/features/notifications/announcements";
import { useDeviceNotifications } from "@/features/notifications/device-settings";
import type { Message } from "@/lib/chat";
import { m } from "@/paraglide/messages";
import { useChannels } from "./queries";
import { useChatNames } from "./use-chat-names";

export const useChatAnnouncer = () => {
  const enabled = useDeviceNotifications();
  const navigate = useNavigate();
  const router = useRouter();
  const { channels } = useChannels();
  const { me, nameOf, titleOf } = useChatNames();
  return useCallback(
    (message: Message) => {
      if (!enabled || message.authorId === me) return;
      if (document.visibilityState === "visible") return;
      const channel = channels.find((candidate) => candidate.id === message.channelId);
      const direct = channel?.kind === "direct";
      if (!direct && !message.mentions.includes(me)) return;
      const author = nameOf(message.authorId);
      showNotification(
        direct || !channel
          ? author
          : m.chat_notification_in({ name: author, channel: titleOf(channel) }),
        message.text,
        `chat-${message.channelId}`,
        router.buildLocation({ to: "/chat", search: { channel: message.channelId } }).href,
        (href) => void navigate({ href }),
      );
    },
    [enabled, me, channels, nameOf, titleOf, router, navigate],
  );
};
