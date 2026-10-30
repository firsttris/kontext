import { createFileRoute, redirect } from "@tanstack/react-router";
import { CAPABILITIES } from "@/jmap/client";
import { parseMailto } from "@/lib/mailto";
import { z } from "@/lib/zod";

/**
 * A new mail from outside the app: a mailto: link (Kontext as the mail program) or a share from
 * another app (the service worker kept it, src/sw/service-worker.ts). Opens the own inbox with
 * the composer filled in.
 */
export const Route = createFileRoute("/_app/compose")({
  validateSearch: z.object({ mailto: z.string().optional(), shared: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    const session = await context.client!.getSession();
    const accountId =
      session.primaryAccounts[CAPABILITIES.mail] ?? Object.keys(session.accounts)[0]!;
    const start = search.mailto ? parseMailto(search.mailto) : null;
    throw redirect({
      to: "/mail/$accountId/$mailboxId",
      params: { accountId, mailboxId: "inbox" },
      search: {
        compose: "new",
        ...(start?.to ? { to: start.to } : {}),
        ...(start?.cc ? { cc: start.cc } : {}),
        ...(start?.subject ? { subject: start.subject } : {}),
        ...(start?.body ? { body: start.body } : {}),
        ...(search.shared ? { shared: search.shared } : {}),
      },
      replace: true,
    });
  },
});
