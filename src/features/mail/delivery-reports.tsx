/**
 * Delivery reports (DSN): at a report, who it is about and whether the mail arrived; at a mail
 * one sent asking for one, what the receiving servers reported (src/jmap/delivery-reports.ts).
 */
import { useQuery } from "@tanstack/react-query";
import { CircleAlert, Clock, PackageCheck } from "lucide-react";
import { useClient } from "@/auth/auth";
import { readDeliveryReport, reportsFor, requestedReport } from "@/jmap/delivery-reports";
import type { EmailAddress, EmailDetail } from "@/jmap/types";
import { type DeliveryOutcome, isDeliveryReport, type RecipientReport } from "@/lib/dsn";
import { displayName, noteDate } from "@/lib/format";
import { m } from "@/paraglide/messages";

const line =
  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-border px-3 py-2 text-[13px]";

const SENTENCE: Record<DeliveryOutcome, (args: { name: string; when: string }) => string> = {
  delivered: m.mail_dsn_delivered,
  failed: m.mail_dsn_failed,
  delayed: m.mail_dsn_delayed,
  relayed: m.mail_dsn_relayed,
};

const ICON: Record<DeliveryOutcome, { Icon: typeof PackageCheck; tone: string }> = {
  delivered: { Icon: PackageCheck, tone: "text-ok" },
  failed: { Icon: CircleAlert, tone: "text-danger" },
  delayed: { Icon: Clock, tone: "text-warn" },
  relayed: { Icon: PackageCheck, tone: "text-muted" },
};

/** The recipient by the name the mail had for them, else the address. */
const nameOf = (recipient: string, known: EmailAddress[]) =>
  displayName(
    known.find((address) => address.email.toLowerCase() === recipient.toLowerCase()) ?? {
      name: null,
      email: recipient,
    },
  );

const sentence = (report: RecipientReport, when: string, known: EmailAddress[]) =>
  SENTENCE[report.outcome]({
    name: nameOf(report.recipient, known),
    when: noteDate(report.lastAttempt ?? when),
  });

/** At a report itself: one line per recipient, with the server's words when it failed. */
export const DeliveryReportCard = ({
  accountId,
  email,
}: {
  accountId: string;
  email: EmailDetail;
}) => {
  const client = useClient();
  const isReport = isDeliveryReport(email.contentType);
  const { data: report } = useQuery({
    queryKey: [accountId, "emails", "dsn", email.id],
    queryFn: () => readDeliveryReport(client, accountId, email.bodyStructure),
    enabled: isReport,
    staleTime: Number.POSITIVE_INFINITY,
  });
  if (!isReport || !report?.recipients.length) return null;
  return (
    <section
      aria-label={m.mail_dsn_report()}
      className="flex flex-col gap-1.5 rounded-lg border border-border px-3 py-2 text-[13px]"
    >
      <span className="text-[12px] text-muted">
        {report.reportingMta
          ? m.mail_dsn_report_from({ server: report.reportingMta })
          : m.mail_dsn_report()}
      </span>
      <ul className="flex flex-col gap-1.5">
        {report.recipients.map((recipient) => {
          const { Icon, tone } = ICON[recipient.outcome];
          return (
            <li key={recipient.recipient} className="flex items-start gap-2">
              <Icon size={15} className={`mt-0.5 shrink-0 ${tone}`} aria-hidden="true" />
              <span className="flex min-w-0 flex-col">
                <span>{sentence(recipient, email.receivedAt, [])}</span>
                {recipient.outcome !== "delivered" && recipient.diagnostic ? (
                  <span className="break-words text-[12px] text-muted">{recipient.diagnostic}</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
};

/** At a mail one sent asking for a delivery report: what came back, per recipient. */
export const DeliveryReportsReceived = ({
  accountId,
  email,
}: {
  accountId: string;
  email: EmailDetail;
}) => {
  const client = useClient();
  const { data: reportId } = useQuery({
    queryKey: [accountId, "emails", "dsn-asked", email.id],
    queryFn: () => requestedReport(client, accountId, email.id),
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { data: reports = [] } = useQuery({
    // Under the account: a report arriving refreshes it.
    queryKey: [accountId, "emails", "dsn-for", email.id, reportId],
    queryFn: () =>
      reportsFor(client, accountId, {
        reportId: reportId!,
        subject: email.subject ?? "",
        sentAt: email.sentAt ?? email.receivedAt,
      }),
    enabled: Boolean(reportId),
  });
  if (!reportId) return null;
  const known = [...(email.to ?? []), ...(email.cc ?? []), ...(email.bcc ?? [])];
  const lines = reports.flatMap((report) =>
    report.recipients.map((recipient) => ({ recipient, when: report.receivedAt })),
  );
  const allDelivered =
    lines.length > 0 && lines.every(({ recipient }) => recipient.outcome === "delivered");
  return (
    <div role="note" aria-label={m.mail_dsn_report()} className={line}>
      <PackageCheck
        size={15}
        className={allDelivered ? "text-ok" : "text-muted"}
        aria-hidden="true"
      />
      <span className="text-muted">
        {lines.length
          ? lines.map(({ recipient, when }) => sentence(recipient, when, known)).join(" · ")
          : m.mail_dsn_waiting()}
      </span>
    </div>
  );
};
