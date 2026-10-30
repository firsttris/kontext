import { createFileRoute, redirect } from "@tanstack/react-router";
import { CAPABILITIES } from "@/jmap/client";
import { z } from "@/lib/zod";

/** /mail opens the inbox of the user's own mailbox; /mail?compose=new (app shortcut) a new mail. */
export const Route = createFileRoute("/_app/mail/")({
  validateSearch: z.object({ compose: z.literal("new").optional() }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.client!.getSession();
    const accountId =
      session.primaryAccounts[CAPABILITIES.mail] ?? Object.keys(session.accounts)[0]!;
    throw redirect({
      to: "/mail/$accountId/$mailboxId",
      params: { accountId, mailboxId: "inbox" },
      search: search.compose ? { compose: "new" } : {},
    });
  },
});
