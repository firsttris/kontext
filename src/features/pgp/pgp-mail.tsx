/**
 * PGP in the mail view: an encrypted mail opens after unlocking one's key (only in this tab) and
 * shows its text and attachments, decrypted in the browser; a signed one says whose signature it
 * is and whether it holds (src/lib/pgp-mail.ts).
 */
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  FileText,
  LockKeyhole,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useClient } from "@/auth/auth";
import { useTheme } from "@/components/theme/use-theme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { EmailDetail } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { formatSize } from "@/lib/format";
import { mailDocument, sanitizeMailHtml, textToHtml } from "@/lib/html";
import { unlockKey } from "@/lib/pgp";
import { checkSigned, type ReadMail, readEncrypted, type Signature } from "@/lib/pgp-mail";
import { m } from "@/paraglide/messages";
import { keepUnlocked, useKnownKeys, useOwnKey, useUnlockedKey } from "./queries";

const useRaw = (accountId: string, email: EmailDetail, enabled: boolean) => {
  const client = useClient();
  return useQuery({
    queryKey: [accountId, "raw", email.id],
    queryFn: async () =>
      (await client.download(accountId, email.blobId, "mail.eml", "message/rfc822")).text(),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });
};

/** The sender's keys one knows, to check their signature. */
const useSenderKeys = (email: EmailDetail) => {
  const sender = email.from?.[0]?.email.toLowerCase();
  return useKnownKeys()
    .filter((key) => key.email === sender)
    .map((key) => key.publicKey);
};

export const SignatureNote = ({ signature, sender }: { signature: Signature; sender: string }) => {
  if (signature.state === "none") return null;
  const [Icon, tone, text] =
    signature.state === "valid"
      ? [ShieldCheck, "text-ok", m.pgp_signed_valid({ sender })]
      : signature.state === "invalid"
        ? [ShieldAlert, "text-danger", m.pgp_signed_invalid()]
        : [ShieldQuestion, "text-muted", m.pgp_signed_unknown({ sender })];
  return (
    <span className={cn("flex items-center gap-1.5 text-[13px]", tone)}>
      <Icon size={15} aria-hidden="true" /> {text}
    </span>
  );
};

/** A signed (not encrypted) mail: whose signature, checked against the known key. */
export const SignedNote = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const raw = useRaw(accountId, email, true);
  const keys = useSenderKeys(email);
  const { data: signature } = useQuery({
    queryKey: [accountId, "signed", email.id, keys.length],
    queryFn: () => checkSigned(raw.data!, email.contentType ?? "", keys),
    enabled: Boolean(raw.data),
  });
  if (!signature) return null;
  return (
    <div role="note" className="rounded-lg border border-border px-3 py-2">
      <SignatureNote signature={signature} sender={email.from?.[0]?.email ?? ""} />
    </div>
  );
};

export const Unlock = () => {
  const { data: own } = useOwnKey();
  const [passphrase, setPassphrase] = useState("");
  const [wrong, setWrong] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!own) return;
    setBusy(true);
    try {
      keepUnlocked(await unlockKey(own.privateKey, passphrase));
    } catch {
      setWrong(true);
    } finally {
      setBusy(false);
    }
  };
  if (!own) return <p className="m-0 text-[14px] text-muted">{m.pgp_no_key()}</p>;
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-2">
      <span className="text-[14px]">{m.pgp_unlock_hint()}</span>
      <div className="flex max-w-[460px] gap-2">
        <Input
          type="password"
          aria-label={m.pgp_unlock_passphrase()}
          placeholder={m.pgp_unlock_passphrase()}
          value={passphrase}
          autoFocus
          onChange={(event) => {
            setPassphrase(event.target.value);
            setWrong(false);
          }}
        />
        <Button type="submit" variant="primary" disabled={busy || !passphrase}>
          {m.pgp_unlock()}
        </Button>
      </div>
      {wrong ? (
        <span role="alert" className="text-[13px] text-danger">
          {m.pgp_wrong_passphrase()}
        </span>
      ) : null}
    </form>
  );
};

const Body = ({ read }: { read: ReadMail }) => {
  const dark = useTheme().theme === "dark";
  const [height, setHeight] = useState(160);
  const document = useMemo(() => {
    const source = read.html ?? textToHtml(read.text);
    return mailDocument(sanitizeMailHtml(source, { allowRemote: false, cidUrls: {} }).html, dark);
  }, [read, dark]);
  return (
    <iframe
      title={m.mail_body_title()}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      srcDoc={document}
      onLoad={(event) =>
        setHeight((event.currentTarget.contentDocument?.body.scrollHeight ?? 152) + 8)
      }
      className="w-full border-0 bg-transparent"
      style={{ height }}
    />
  );
};

const Files = ({ files }: { files: ReadMail["attachments"] }) => {
  const urls = useMemo(
    () =>
      files.map((file) =>
        URL.createObjectURL(new Blob([file.bytes as Uint8Array<ArrayBuffer>], { type: file.type })),
      ),
    [files],
  );
  useEffect(
    () => () => {
      for (const url of urls) URL.revokeObjectURL(url);
    },
    [urls],
  );
  if (!files.length) return null;
  return (
    <ul aria-label={m.mail_attachments()} className="m-0 flex list-none flex-wrap gap-2 p-0">
      {files.map((file, index) => (
        <li key={urls[index]}>
          <a
            href={urls[index]}
            download={file.name}
            className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-fg no-underline hover:bg-hover"
          >
            <FileText size={16} className="text-muted" aria-hidden="true" />
            <span className="flex flex-col">
              <span className="text-[13px] font-medium">{file.name}</span>
              <span className="text-[11px] text-muted">{formatSize(file.bytes.length)}</span>
            </span>
            <Download size={14} className="text-muted" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
};

/** In place of the body of an encrypted mail. */
export const EncryptedMail = ({ accountId, email }: { accountId: string; email: EmailDetail }) => {
  const key = useUnlockedKey();
  const keys = useSenderKeys(email);
  const raw = useRaw(accountId, email, Boolean(key));
  const { data: read, error } = useQuery({
    queryKey: [accountId, "decrypted", email.id, key?.getFingerprint(), keys.length],
    queryFn: () => readEncrypted(raw.data!, key!, keys),
    enabled: Boolean(key && raw.data),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-border px-3 py-2">
        <span className="flex items-center gap-1.5 text-[13px] font-medium text-accent">
          <LockKeyhole size={15} aria-hidden="true" /> {m.pgp_encrypted()}
        </span>
        {read ? (
          <SignatureNote signature={read.signature} sender={email.from?.[0]?.email ?? ""} />
        ) : null}
      </div>
      {!key ? <Unlock /> : null}
      {error ? (
        <p role="alert" className="m-0 text-[14px] text-danger">
          {m.pgp_cannot_decrypt()}
        </p>
      ) : null}
      {read ? (
        <>
          <Body read={read} />
          <Files files={read.attachments} />
        </>
      ) : key && !error ? (
        <p className="m-0 text-[14px] text-muted">{m.pgp_decrypting()}</p>
      ) : null}
    </div>
  );
};
