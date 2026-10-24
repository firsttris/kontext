import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { useClient } from "@/auth/auth";
import { AppShell, railButton } from "@/components/shell/app-shell";
import { useInboxes } from "@/features/mail/queries";
import { NotificationBell } from "@/features/notifications/notification-bell";
import { subscribeToChanges } from "@/jmap/push";
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
      subscribeToChanges(client, (changed) => {
        for (const accountId of Object.keys(changed)) {
          void queryClient.invalidateQueries({ queryKey: [accountId] });
        }
      }),
    [client, queryClient],
  );
};

function AppLayout() {
  usePush();
  // Unread mail of all inboxes on the app's icon, as in "Alle Posteingänge".
  useAppBadge(useInboxes().reduce((sum, inbox) => sum + inbox.mailbox.unreadEmails, 0));
  return (
    <AppShell bell={<NotificationBell className={railButton(false)} />}>
      <Outlet />
    </AppShell>
  );
}
