import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MailPage } from "@/features/mail/mail-page";

export const mailSearchSchema = z.object({
  /** The open mail. */
  email: z.string().optional(),
  /** "Alle Posteingänge" (`/mail/all/inbox`): the account of the open mail. */
  account: z.string().optional(),
  /**
   * Composer: a new mail, an answer to / forward of the open mail (also as an .eml file), or the
   * open draft.
   */
  compose: z.enum(["new", "reply", "replyAll", "forward", "forwardEml", "draft"]).optional(),
  /** "Als Anhang weiterleiten" of several picked mails: their ids, comma-separated. */
  emails: z.string().optional(),
  /** Prefilled recipient for a new mail, e.g. from the contacts or a mailto: link. */
  to: z.string().optional(),
  /** More of a mailto: link (src/routes/_app/compose.tsx). */
  cc: z.string().optional(),
  subject: z.string().optional(),
  body: z.string().optional(),
  /** Something another app shared with Kontext, kept by the service worker. */
  shared: z.string().optional(),
  /** The search text on `/mail/all/search` (src/lib/mail-search.ts). */
  q: z.string().optional(),
  unread: z.boolean().optional(),
  /** The Sent folder: only the mails still waiting to go out ("Später senden"). */
  scheduled: z.boolean().optional(),
  /** Phone only: the folder list as its own screen. */
  folders: z.boolean().optional(),
});

export type MailSearch = z.infer<typeof mailSearchSchema>;

export const Route = createFileRoute("/_app/mail/$accountId/$mailboxId")({
  validateSearch: mailSearchSchema,
  component: MailRoute,
});

function MailRoute() {
  const { accountId, mailboxId } = Route.useParams();
  const search = Route.useSearch();
  return <MailPage accountId={accountId} mailboxParam={mailboxId} search={search} />;
}
