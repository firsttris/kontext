/**
 * Sending a mail from an external address: the app saved it as a draft in Stalwart as usual; the
 * server reads it with the person's own token, hands it to the provider's SMTP server without its
 * Bcc header, and files it under Sent – what JMAP's EmailSubmission would do (RFC 8621 §7.5), only
 * through another server. Recipients the provider turns down are reported; the mail still counts
 * as sent, as it went out to the others and sending it again would reach them twice.
 */
import type { Sealer } from "../crypto";
import { recipientsOf, withoutBcc } from "./raw";
import type { Smtp } from "./smtp";
import type { ExternalAccount } from "./store";
import type { UserJmap } from "./user-jmap";

export type SendRequest = { emailId: string; draftsId: string; sentId: string };

type Address = { name: string | null; email: string };
type Draft = {
  id: string;
  blobId: string;
  from: Address[] | null;
  to: Address[] | null;
  cc: Address[] | null;
  bcc: Address[] | null;
  mailboxIds: Record<string, boolean>;
};

/** Sent; `refused` are recipients the provider turned down (the others got it). */
export type SendOutcome =
  | { ok: true; refused: string[] }
  | { ok: false; status: 400 | 404 | 502; error: string };

const sameAddress = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const sendThrough = async (
  deps: { smtp: Smtp; sealer: Sealer; jmap: UserJmap },
  account: ExternalAccount,
  request: SendRequest,
): Promise<SendOutcome> => {
  const { smtp, sealer, jmap } = deps;
  const [got] = await jmap.call<{ list?: Draft[] }>([
    [
      "Email/get",
      {
        accountId: account.accountId,
        ids: [request.emailId],
        properties: ["blobId", "from", "to", "cc", "bcc", "mailboxIds"],
      },
      "g",
    ],
  ]);
  const draft = got?.list?.[0];
  if (!draft) return { ok: false, status: 404, error: "Unbekannte Mail" };
  // Only what is written as this address goes out through its provider.
  if (!draft.from?.length || !draft.from.every((from) => sameAddress(from.email, account.email)))
    return { ok: false, status: 400, error: `Die Mail ist nicht von ${account.email}.` };
  const to = recipientsOf(draft.to, draft.cc, draft.bcc);
  if (!to.length) return { ok: false, status: 400, error: "Die Mail hat keine Empfänger." };

  const raw = withoutBcc(await jmap.download(account.accountId, draft.blobId));
  const sent = await smtp.send(
    { host: account.smtpHost, port: account.smtpPort },
    { user: account.login, password: await sealer.open(account.secret) },
    { from: account.email, to },
    raw,
  );
  if (!sent.ok) {
    const why =
      sent.error.reason === "login"
        ? `${account.email}: Anmeldung beim Postausgang abgelehnt. Bitte das (App-)Passwort neu eintragen.`
        : sent.error.reason === "rejected"
          ? `${account.email} hat die Mail abgelehnt: ${sent.error.message}`
          : `Der Postausgang von ${account.email} antwortet nicht (${sent.error.message}).`;
    return { ok: false, status: 502, error: why };
  }

  // Out of the drafts into Sent; a failure here does not unsend it, so it is not reported as one.
  await jmap
    .call([
      [
        "Email/set",
        {
          accountId: account.accountId,
          update: {
            [draft.id]: {
              [`mailboxIds/${request.draftsId}`]: null,
              [`mailboxIds/${request.sentId}`]: true,
              "keywords/$draft": null,
            },
          },
        },
        "s",
      ],
    ])
    .catch(() => undefined);
  return { ok: true, refused: sent.refused };
};
