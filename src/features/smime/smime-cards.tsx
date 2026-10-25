/**
 * Settings: one's own S/MIME certificate (a .p12 file from an authority, with its password) and
 * those of others, from their signed mails or a file – for authorities and firms that use S/MIME.
 */
import { AlertTriangle, Download, Trash2, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { downloadText } from "@/lib/download";
import { groupFingerprint } from "@/lib/pgp";
import { bytesToBase64 } from "@/lib/secure";
import { certToPem, openP12, readCertificate } from "@/lib/smime";
import { m } from "@/paraglide/messages";
import { SettingsCard } from "../settings/settings-page";
import { keepSmimeOpen, useKnownCerts, useOwnCert, useSmimeActions } from "./queries";
import { untilLabel } from "./smime-mail";

const ImportDialog = ({ onClose }: { onClose: () => void }) => {
  const { data: session } = useSession();
  const actions = useSmimeActions();
  const toast = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!file) return;
    setBusy(true);
    setProblem(null);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const own = await openP12(bytes, password).catch(() => null);
      if (!own) return setProblem(m.smime_wrong_password());
      const address = (session?.username ?? "").toLowerCase();
      if (!own.info.emails.includes(address)) {
        return setProblem(m.smime_not_yours({ email: address }));
      }
      await actions.setOwn({ certificate: await certToPem(own.cert), p12: bytesToBase64(bytes) });
      keepSmimeOpen(own);
      toast.show(m.smime_saved());
      onClose();
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={m.smime_import()}
      description={m.smime_import_hint()}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <Label>
          {m.smime_file()}
          <input
            type="file"
            accept=".p12,.pfx,application/x-pkcs12"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setProblem(null);
            }}
            className="text-[14px]"
          />
        </Label>
        <Label>
          {m.smime_password()}
          <Input
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setProblem(null);
            }}
          />
        </Label>
        {problem ? (
          <span role="alert" className="text-[13px] text-danger">
            {problem}
          </span>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.tasks_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !file}>
            {busy ? m.pgp_working() : m.smime_import()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export const OwnCertCard = () => {
  const { data: own, isPending } = useOwnCert();
  const actions = useSmimeActions();
  const toast = useToast();
  const [importing, setImporting] = useState(false);
  const expired = own ? new Date(own.notAfter) < new Date() : false;

  const remove = async () => {
    if (!window.confirm(m.smime_delete_confirm())) return;
    await actions
      .removeOwn()
      .catch((error: Error) => toast.show(m.common_error({ message: error.message }), "error"));
  };

  return (
    <SettingsCard title={m.smime_own_title()} description={m.smime_own_hint()}>
      {isPending ? null : own ? (
        <>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
            <dt className="text-muted">{m.pgp_address()}</dt>
            <dd className="m-0">{own.email}</dd>
            <dt className="text-muted">{m.smime_valid_until()}</dt>
            <dd className={expired ? "m-0 text-danger" : "m-0"}>
              {expired ? m.smime_expired() : untilLabel(own.notAfter)}
            </dd>
            <dt className="text-muted">{m.pgp_fingerprint()}</dt>
            <dd className="m-0 font-mono text-[13px] break-all">
              {groupFingerprint(own.fingerprint)}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadText(own.certificate, `${own.email}.pem`, "application/x-pem-file")
              }
            >
              <Download size={15} /> {m.smime_download()}
            </Button>
            <Button variant="outline" onClick={() => setImporting(true)}>
              {m.smime_replace()}
            </Button>
            <Button variant="ghost" className="text-danger" onClick={() => void remove()}>
              {m.smime_delete()}
            </Button>
          </div>
        </>
      ) : (
        <Button variant="outline" className="self-start" onClick={() => setImporting(true)}>
          <Upload size={15} /> {m.smime_import()}
        </Button>
      )}
      {importing ? <ImportDialog onClose={() => setImporting(false)} /> : null}
    </SettingsCard>
  );
};

export const KnownCertsCard = () => {
  const certs = useKnownCerts();
  const actions = useSmimeActions();
  const toast = useToast();
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");

  const bring = async (file: File) => {
    try {
      const { pem } = await readCertificate(new Uint8Array(await file.arrayBuffer()));
      await actions.remember({ certificate: pem, source: "import" });
      toast.show(m.smime_cert_added());
    } catch (error) {
      fail(error as Error);
    }
  };

  return (
    <SettingsCard title={m.smime_known_title()} description={m.smime_known_hint()}>
      {certs.length ? (
        <ul
          aria-label={m.smime_known_title()}
          className="m-0 flex list-none flex-col divide-y divide-border p-0"
        >
          {certs.map((cert) => (
            <li key={cert.email} className="flex items-start gap-3 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium">{cert.email}</span>
                <span className="text-[12px] text-muted">
                  {m.smime_cert_line({ issuer: cert.issuer, until: untilLabel(cert.notAfter) })}
                </span>
                <span className="font-mono text-[12px] break-all text-muted">
                  {groupFingerprint(cert.fingerprint)}
                </span>
                {cert.previousFingerprint ? (
                  <span className="flex items-center gap-1.5 text-[12px] text-warn">
                    <AlertTriangle size={13} aria-hidden="true" /> {m.smime_cert_changed()}
                  </span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={m.pgp_forget({ email: cert.email })}
                onClick={() => void actions.forget(cert.email).catch(fail)}
              >
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.smime_known_none()}</p>
      )}
      <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 self-start rounded-lg px-3 text-[14px] text-muted hover:bg-hover hover:text-fg">
        <Upload size={15} /> {m.smime_cert_import()}
        <input
          type="file"
          accept=".cer,.crt,.pem,.der,application/pkix-cert,application/x-x509-ca-cert"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void bring(file);
            event.target.value = "";
          }}
        />
      </label>
    </SettingsCard>
  );
};
