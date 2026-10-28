/**
 * The sender check in the reading pane: a warning above the mail when something is off, and the
 * details to unfold (who sent it to whom, what the mail server found, spam score, sizes).
 * The rules are in src/lib/sender-check.ts.
 */
import { Check, Minus, ShieldAlert, X } from "lucide-react";
import type { ReactNode } from "react";
import type { EmailDetail } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { formatSize, fullAddress, readingDate } from "@/lib/format";
import { LOCALE } from "@/lib/locale";
import {
  domainOf,
  isConfirmed,
  type MethodResult,
  parseSenderCheck,
  parseSpamScore,
  type SenderWarning,
  senderWarnings,
} from "@/lib/sender-check";
import { m } from "@/paraglide/messages";
import { useMailAccounts } from "./queries";

/** The domains of the own company: those of the user's mailboxes. */
const useOwnDomains = (): string[] => {
  const accounts = useMailAccounts();
  return [...new Set(accounts.flatMap((account) => domainOf(account.name) ?? []))];
};

const warningText = (warning: SenderWarning): string =>
  warning.kind === "ownDomain"
    ? m.mail_warn_own_domain({ domain: warning.domain })
    : warning.kind === "notConfirmed"
      ? m.mail_warn_not_confirmed({ domain: warning.domain })
      : m.mail_warn_reply_to({ replyTo: warning.replyTo, from: warning.from });

export const SenderWarnings = ({ email }: { email: EmailDetail }) => {
  const ownDomains = useOwnDomains();
  const warnings = senderWarnings({
    check: parseSenderCheck(email.authenticationResults),
    from: email.from?.[0],
    replyTo: email.replyTo,
    ownDomains,
  });
  if (warnings.length === 0) return null;
  return (
    <div role="alert" className="flex flex-col gap-2">
      {warnings.map((warning) => (
        <p
          key={warning.kind}
          className="m-0 flex gap-2.5 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2.5 text-[13px] leading-snug"
        >
          <ShieldAlert size={16} className="mt-px shrink-0 text-danger" aria-hidden="true" />
          {warningText(warning)}
        </p>
      ))}
    </div>
  );
};

const RESULT_WORDS: Record<string, () => string> = {
  pass: m.mail_check_pass,
  fail: m.mail_check_fail,
  softfail: m.mail_check_softfail,
  none: m.mail_check_none,
  neutral: m.mail_check_neutral,
  temperror: m.mail_check_error,
  permerror: m.mail_check_error,
};

/** One check as a chip: "✓ SPF bestanden · keller-elektro.de". */
const ResultChip = ({ label, result }: { label: string; result: MethodResult }) => {
  const passed = result.result === "pass";
  const failed = result.result === "fail" || result.result === "softfail";
  const Icon = passed ? Check : failed ? X : Minus;
  return (
    <li className="flex items-center gap-1.5 rounded-md border border-border px-2 py-1 text-[12px]">
      <Icon
        size={13}
        aria-hidden="true"
        className={cn(passed ? "text-ok" : failed ? "text-danger" : "text-muted")}
      />
      <span className="font-medium">{label}</span>
      <span className={cn(passed ? "text-ok" : failed ? "text-danger" : "text-muted")}>
        {RESULT_WORDS[result.result]?.() ?? result.result}
      </span>
      {result.domain ? <span className="text-muted">· {result.domain}</span> : null}
    </li>
  );
};

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-2">
    <h3 className="m-0 text-[11px] font-medium tracking-wide text-muted uppercase">{title}</h3>
    {children}
  </div>
);

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="grid grid-cols-[92px_minmax(0,1fr)] gap-3 text-[13px]">
    <dt className="text-muted">{label}</dt>
    <dd className="m-0 break-words">{children}</dd>
  </div>
);

const addresses = (list: EmailDetail["to"]) => list?.map(fullAddress).join(", ");

const CheckSummary = ({ email }: { email: EmailDetail }) => {
  const check = parseSenderCheck(email.authenticationResults);
  const spam = parseSpamScore(email.spamScore?.[0]);
  const domain = domainOf(email.from?.[0]?.email) ?? "";
  if (!check) return <p className="m-0 text-[13px] text-muted">{m.mail_check_internal()}</p>;
  const failed = check.dmarc?.result === "fail" || check.spf?.result === "fail";
  const summary = isConfirmed(check, domain)
    ? m.mail_check_confirmed({ domain })
    : failed
      ? m.mail_check_failed({ domain })
      : m.mail_check_unproven({ domain });
  const chips = [
    ["SPF", check.spf],
    ["DKIM", check.dkim],
    ["DMARC", check.dmarc],
    [m.mail_check_reverse_dns(), check.iprev],
  ] as const;
  return (
    <>
      <p className="m-0 text-[13px]">{summary}</p>
      <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
        {chips.map(([label, result]) =>
          result ? <ResultChip key={label} label={label} result={result} /> : null,
        )}
      </ul>
      {spam ? (
        <dl className="m-0">
          <Field label={m.mail_details_spam()}>
            {spam.isSpam ? m.mail_spam_yes() : m.mail_spam_no()} ·{" "}
            {spam.score.toLocaleString(LOCALE)}
          </Field>
        </dl>
      ) : null}
    </>
  );
};

export const MessageDetails = ({
  email,
  attachments,
}: {
  email: EmailDetail;
  /** The attachments the pane lists (inline images left out). */
  attachments: EmailDetail["attachments"];
}) => (
  <section
    aria-label={m.mail_details_title()}
    className="grid gap-x-8 gap-y-5 rounded-xl border border-border p-4 md:grid-cols-2"
  >
    <Group title={m.mail_details_people()}>
      <dl className="m-0 flex flex-col gap-1.5">
        <Field label={m.mail_details_from()}>{addresses(email.from)}</Field>
        <Field label={m.mail_details_to()}>{addresses(email.to)}</Field>
        {email.cc?.length ? <Field label={m.mail_details_cc()}>{addresses(email.cc)}</Field> : null}
        {email.bcc?.length ? (
          <Field label={m.mail_details_bcc()}>{addresses(email.bcc)}</Field>
        ) : null}
        {email.replyTo?.length ? (
          <Field label={m.mail_details_reply_to()}>{addresses(email.replyTo)}</Field>
        ) : null}
        {email.sentAt ? (
          <Field label={m.mail_details_sent()}>{readingDate(email.sentAt)}</Field>
        ) : null}
        <Field label={m.mail_details_received()}>{readingDate(email.receivedAt)}</Field>
        <Field label={m.mail_details_size()}>{formatSize(email.size)}</Field>
        {attachments.length ? (
          <Field label={m.mail_details_attachments()}>
            {attachments.length} ·{" "}
            {formatSize(attachments.reduce((sum, part) => sum + part.size, 0))}
          </Field>
        ) : null}
        {email.messageId?.[0] ? (
          <Field label={m.mail_details_message_id()}>
            <span className="font-mono text-[12px] text-muted">{email.messageId[0]}</span>
          </Field>
        ) : null}
      </dl>
    </Group>
    <Group title={m.mail_details_check()}>
      <CheckSummary email={email} />
    </Group>
  </section>
);
