import { createFileRoute, redirect } from "@tanstack/react-router";
import { CAPABILITIES } from "@/jmap/client";

/** /mail opens the inbox of the user's own mailbox. */
export const Route = createFileRoute("/_app/mail/")({
  beforeLoad: async ({ context }) => {
    const session = await context.client!.getSession();
    const accountId =
      session.primaryAccounts[CAPABILITIES.mail] ?? Object.keys(session.accounts)[0]!;
    throw redirect({
      to: "/mail/$accountId/$mailboxId",
      params: { accountId, mailboxId: "inbox" },
    });
  },
});
