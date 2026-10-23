import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { MailPage } from "@/features/mail/mail-page";

export const mailSearchSchema = z.object({
  /** The open mail. */
  email: z.string().optional(),
  /** Composer: a new mail, an answer to / forward of the open mail, or the open draft. */
  compose: z.enum(["new", "reply", "replyAll", "forward", "draft"]).optional(),
  /** Prefilled recipient for a new mail, e.g. from the contacts. */
  to: z.string().optional(),
  q: z.string().optional(),
  unread: z.boolean().optional(),
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
