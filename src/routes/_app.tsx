import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { useClient } from "@/auth/auth";
import { IdleGuard } from "@/auth/idle-guard";
import { AppShell, railButton } from "@/components/shell/app-shell";
import { CallHost } from "@/features/calls/call-host";
import { useChannels } from "@/features/chat/queries";
import { useChatAnnouncer } from "@/features/chat/use-chat-announcer";
import { DocumentsHost } from "@/features/documents/documents-host";
import { useLive } from "@/features/live/use-live";
import { useInboxes } from "@/features/mail/queries";
import { keepPushSubscription } from "@/features/notifications/device-settings";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { PhoneHost } from "@/features/phone/phone-host";
import { SecureCodesDialog } from "@/features/secure/codes-dialog";
import { useMe } from "@/features/tasks/queries";
import { subscribeToChanges } from "@/jmap/push";
import { totalUnread } from "@/lib/chat";
import { useAppBadge } from "@/pwa/badge";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => {
    if (!context.client) throw redirect({ to: "/login", search: { redirect: location.href } });
  },
  component: AppLayout,
});

/** Server changes (new mail, another device, a colleague in a shared mailbox) refresh the views. */
const usePush = () => {
  const client = useClient();
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeToChanges(
        client,
        (changed) => {
          for (const accountId of Object.keys(changed)) {
            void queryClient.invalidateQueries({ queryKey: [accountId] });
          }
        },
        // What arrived before the stream was up: the lists and the folders' counts again.
        () => {
          void queryClient.invalidateQueries({
            predicate: (query) =>
              query.queryKey[1] === "emails" || query.queryKey[1] === "mailboxes",
          });
        },
      ),
    [client, queryClient],
  );
};

function AppLayout() {
  usePush();
  // Notifications with Kontext closed: this browser's subscription belongs to this sign-in.
  useEffect(() => void keepPushSubscription(), []);
  useLive(useMe(), useChatAnnouncer());
  // Unread mail of all inboxes and unread chat messages on the app's icon.
  const unreadMail = useInboxes().reduce((sum, inbox) => sum + inbox.mailbox.unreadEmails, 0);
  useAppBadge(unreadMail + totalUnread(useChannels().channels));
  return (
    <AppShell bell={<NotificationBell className={railButton(false)} />}>
      <Outlet />
      <DocumentsHost />
      <CallHost />
      <SecureCodesDialog />
      <PhoneHost />
      <IdleGuard />
    </AppShell>
  );
}
