/**
 * S/MIME in the mail view: an encrypted mail opens with one's certificate (its password once per
 * tab); a signed one says who signed it and which authority vouches for them. The signer's
 * certificate is kept for writing back, as Autocrypt does for PGP keys.
 */
import { useQuery } from "@tanstack/react-query";
import { LockKeyhole, ShieldAlert, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EmailDetail } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { base64ToBytes } from "@/lib/secure";
import { openP12, readSmime, type SmimeRead, type SmimeSignature } from "@/lib/smime";
import { m } from "@/paraglide/messages";
import { revealSubject } from "../mail/protected-subjects";
import { Body, Files, useRaw } from "../pgp/pgp-mail";
import { keepSmimeOpen, useKnownCerts, useOpenSmime, useOwnCert, useSmimeActions } from "./queries";

const untilLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "medium" });

export const SmimeSignatureNote = ({
  signature,
  sender,
}: {
  signature: SmimeSignature;
  sender: string;
}) => {
  if (signature.state === "none") return null;
  const valid = signature.state === "valid";
  const other = valid && signature.email !== sender.toLowerCase();
  const [Icon, tone, text] = !valid
    ? [ShieldAlert, "text-danger", m.pgp_signed_invalid()]
    : other
      ? [ShieldAlert, "text-warn", m.smime_signed_other({ signer: signature.email, sender })]
      : [
          ShieldCheck,
          signature.info.selfSigned ? "text-muted" : "text-ok",
          signature.info.selfSigned
            ? m.smime_signed_self({ sender })
            : m.smime_signed_valid({ sender, issuer: signature.info.issuer }),
        ];
  return (
    <span className={cn("flex items-center gap-1.5 text-[13px]", tone)}>
      <Icon size={15} aria-hidden="true" /> {text}
    </span>
  );
};

/** Keeps the certificate of a sender who signed, to write back encrypted. */
const useCollect = (email: EmailDetail, read: SmimeRead | undefined) => {
  const known = useKnownCerts();
  const { remember } = useSmimeActions();
  const sender = email.from?.[0]?.email.toLowerCase();
  const signature = read?.signature;
  const fingerprint = signature?.state === "valid" ? signature.info.fingerprint : null;
  const pem = signature?.state === "valid" ? signature.pem : null;
  const signer = signature?.state === "valid" ? signature.email : null;
  const has = known.some((cert) => cert.email === sender && cert.fingerprint === fingerprint);
  useEffect(() => {
    if (!pem || !sender || signer !== sender || has) return;
    void remember({ certificate: pem, source: "mail", email: sender }).catch(() => undefined);
  }, [pem, sender, signer, has, remember]);
};

export const SmimeUnlock = () => {
  const { data: own } = useOwnCert();
  const [password, setPassword] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!own) return;
    setBusy(true);
    try {
      keepSmimeOpen(await openP12(base64ToBytes(own.p12), password));
    } catch {
      setWrong(true);
    } finally {
      setBusy(false);
    }
  };
  if (!own) return <p className="m-0 text-[14px] text-muted">{m.smime_no_cert()}</p>;
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <span className="text-[14px]">{m.smime_unlock_hint()}</span>
      <div className="flex max-w-[460px] gap-2">
        <Input
          type="password"
          aria-label={m.smime_password()}
          placeholder={m.smime_password()}
          value={password}
          autoFocus
          onChange={(event) => {
            setPassword(event.target.value);
            setWrong(false);
          }}
        />
        <Button type="submit" variant="primary" disabled={busy || !password}>
          {m.pgp_unlock()}
        </Button>
      </div>
      {wrong ? (
        <span role="alert" className="text-[13px] text-danger">
          {m.smime_wrong_password()}
        </span>
      ) : null}
    </form>
  );
};

/** A signed mail whose body shows as usual: the note above it. */
export const SmimeSignedNote = ({
  accountId,
  email,
}: {
  accountId: string;
  email: EmailDetail;
}) => {
  const raw = useRaw(accountId, email, true);
  const { data: read } = useQuery({
    queryKey: [accountId, "smime-signed", email.id],
    queryFn: () => readSmime(raw.data!, null),
    enabled: Boolean(raw.data),
    staleTime: Number.POSITIVE_INFINITY,
  });
  useCollect(email, read);
  if (!read) return null;
  return (
    <div role="note" className="rounded-lg border border-border px-3 py-2">
      <SmimeSignatureNote signature={read.signature} sender={email.from?.[0]?.email ?? ""} />
    </div>
  );
};

/**
 * In place of the body of an S/MIME mail whose content is wrapped: encrypted (opened with one's
 * certificate) or signed inside (no certificate needed).
 */
export const SmimeMail = ({
  accountId,
  email,
  encrypted,
}: {
  accountId: string;
  email: EmailDetail;
  encrypted: boolean;
}) => {
  const own = useOpenSmime();
  const ready = !encrypted || Boolean(own);
  const raw = useRaw(accountId, email, ready);
  const { data: read, error } = useQuery({
    queryKey: [accountId, "smime", email.id, own?.info.fingerprint],
    queryFn: () => readSmime(raw.data!, own),
    enabled: ready && Boolean(raw.data),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  useCollect(email, read);
  useEffect(() => revealSubject(email.id, read?.subject ?? null), [email.id, read]);
  const sender = email.from?.[0]?.email ?? "";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border px-3 py-2">
        {encrypted ? (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-accent">
            <LockKeyhole size={15} aria-hidden="true" /> {m.smime_encrypted()}
          </span>
        ) : null}
        {read ? <SmimeSignatureNote signature={read.signature} sender={sender} /> : null}
      </div>
      {!ready ? <SmimeUnlock /> : null}
      {error ? (
        <p role="alert" className="m-0 text-[14px] text-danger">
          {encrypted ? m.smime_cannot_decrypt() : m.pgp_signed_invalid()}
        </p>
      ) : null}
      {read ? (
        <>
          <Body read={read} />
          <Files files={read.attachments} />
        </>
      ) : ready && !error ? (
        <p className="m-0 text-[14px] text-muted">{m.pgp_decrypting()}</p>
      ) : null}
    </div>
  );
};

export { untilLabel };
