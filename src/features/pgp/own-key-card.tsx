/**
 * Settings: one's own key – make one or bring one along, the recovery code to keep, the
 * fingerprint, download, a new passphrase (also with the recovery code), delete.
 */
import { Download, KeyRound, Printer } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useSession } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { downloadText } from "@/lib/download";
import {
  createOwnKey,
  groupFingerprint,
  importOwnKey,
  type LockedKey,
  normalizeCode,
  relock,
  unlockKey,
} from "@/lib/pgp";
import { m } from "@/paraglide/messages";
import { useSendAccount } from "../mail/use-send-account";
import { usePersonalAccountId } from "../settings/queries";
import { SettingsCard } from "../settings/settings-page";
import { keepUnlocked, type OwnKey, useOwnKey, usePgpActions } from "./queries";

const MIN_PASSPHRASE = 10;

/** Two fields for a new passphrase; the reason it cannot be used yet, or null. */
const passphraseProblem = (passphrase: string, again: string) =>
  passphrase.length < MIN_PASSPHRASE
    ? m.pgp_passphrase_short({ count: MIN_PASSPHRASE })
    : passphrase !== again
      ? m.pgp_passphrase_differ()
      : null;

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <Label>
    {label}
    {children}
  </Label>
);

/** The recovery code, to write down or print, before the key is kept. */
const RecoveryStep = ({ locked, onDone }: { locked: LockedKey; onDone: () => void }) => {
  const [kept, setKept] = useState(false);
  const print = () => {
    const page = window.open("", "_blank", "width=600,height=400");
    page?.document.write(
      `<title>Kontext</title><h2>${m.pgp_recovery_title()}</h2><p style="font:20px monospace">${locked.recoveryCode}</p><p>${m.pgp_recovery_hint()}</p>`,
    );
    page?.print();
  };
  return (
    <div className="flex flex-col gap-4">
      <p className="m-0 text-[14px]">{m.pgp_recovery_hint()}</p>
      <output
        aria-label={m.pgp_recovery_title()}
        className="block rounded-lg border border-border bg-subtle px-4 py-3 text-center font-mono text-[18px] tracking-wider"
      >
        {locked.recoveryCode}
      </output>
      <Button variant="outline" className="self-start" onClick={print}>
        <Printer size={15} /> {m.pgp_recovery_print()}
      </Button>
      <label className="flex items-center gap-2.5 text-[14px]">
        <input
          type="checkbox"
          checked={kept}
          onChange={(event) => setKept(event.target.checked)}
          className="size-4 accent-[var(--primary)]"
        />
        {m.pgp_recovery_kept()}
      </label>
      <div className="flex justify-end">
        <Button variant="primary" disabled={!kept} onClick={onDone}>
          {m.pgp_save_key()}
        </Button>
      </div>
    </div>
  );
};

/** Make a key or bring one along; then the recovery code; then it is kept. */
const NewKeyDialog = ({ mode, onClose }: { mode: "create" | "import"; onClose: () => void }) => {
  const { data: session } = useSession();
  const { myName } = useSendAccount(usePersonalAccountId() ?? "");
  const actions = usePgpActions();
  const toast = useToast();
  const [armored, setArmored] = useState("");
  const [oldPassphrase, setOldPassphrase] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState<LockedKey | null>(null);
  const problem = passphraseProblem(passphrase, again);

  const make = async (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    setBusy(true);
    try {
      const email = session?.username ?? "";
      setLocked(
        mode === "create"
          ? await createOwnKey(myName || email, email, passphrase)
          : await importOwnKey(armored.trim(), oldPassphrase, passphrase),
      );
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
    }
  };

  const keep = async () => {
    if (!locked) return;
    try {
      await actions.setOwn(locked);
      keepUnlocked(await unlockKey(locked.privateKey, passphrase));
      toast.show(m.pgp_key_saved());
      onClose();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={mode === "create" ? m.pgp_create() : m.pgp_import()}
      description={locked ? undefined : m.pgp_passphrase_hint()}
    >
      {locked ? (
        <RecoveryStep locked={locked} onDone={() => void keep()} />
      ) : (
        <form onSubmit={(event) => void make(event)} className="flex flex-col gap-3">
          {mode === "import" ? (
            <>
              <Field label={m.pgp_import_key()}>
                <Textarea
                  rows={5}
                  value={armored}
                  placeholder="-----BEGIN PGP PRIVATE KEY BLOCK-----"
                  onChange={(event) => setArmored(event.target.value)}
                  className="font-mono text-[12px]"
                />
              </Field>
              <Field label={m.pgp_import_old_passphrase()}>
                <Input
                  type="password"
                  value={oldPassphrase}
                  onChange={(event) => setOldPassphrase(event.target.value)}
                />
              </Field>
            </>
          ) : null}
          <Field label={m.pgp_passphrase()}>
            <Input
              type="password"
              autoComplete="new-password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
            />
          </Field>
          <Field label={m.pgp_passphrase_again()}>
            <Input
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(event) => setAgain(event.target.value)}
            />
          </Field>
          {passphrase && problem ? (
            <p role="alert" className="m-0 text-[13px] text-danger">
              {problem}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              {m.tasks_cancel()}
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={busy || Boolean(problem) || (mode === "import" && !armored.trim())}
            >
              {busy ? m.pgp_working() : m.pgp_next()}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
};

/** A new passphrase: with the old one, or with the recovery code when it is forgotten. */
const PassphraseDialog = ({
  own,
  forgotten,
  onClose,
}: {
  own: OwnKey;
  forgotten: boolean;
  onClose: () => void;
}) => {
  const actions = usePgpActions();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const problem = passphraseProblem(passphrase, again);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (problem) return;
    setBusy(true);
    try {
      const open = forgotten
        ? await unlockKey(own.recoveryKey, normalizeCode(current))
        : await unlockKey(own.privateKey, current);
      await actions.setOwn({
        publicKey: own.publicKey,
        privateKey: await relock(open, passphrase),
        recoveryKey: own.recoveryKey,
      });
      keepUnlocked(open);
      toast.show(m.pgp_passphrase_changed());
      onClose();
    } catch {
      toast.show(forgotten ? m.pgp_wrong_code() : m.pgp_wrong_passphrase(), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => !open && onClose()}
      title={forgotten ? m.pgp_forgotten() : m.pgp_change_passphrase()}
    >
      <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3">
        <Field label={forgotten ? m.pgp_recovery_title() : m.pgp_current_passphrase()}>
          <Input
            type={forgotten ? "text" : "password"}
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            className={forgotten ? "font-mono uppercase" : undefined}
          />
        </Field>
        <Field label={m.pgp_passphrase()}>
          <Input
            type="password"
            autoComplete="new-password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
          />
        </Field>
        <Field label={m.pgp_passphrase_again()}>
          <Input
            type="password"
            autoComplete="new-password"
            value={again}
            onChange={(event) => setAgain(event.target.value)}
          />
        </Field>
        {passphrase && problem ? (
          <p role="alert" className="m-0 text-[13px] text-danger">
            {problem}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.tasks_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !current || Boolean(problem)}>
            {m.company_save()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

export const OwnKeyCard = () => {
  const { data: own, isPending } = useOwnKey();
  const actions = usePgpActions();
  const toast = useToast();
  const [dialog, setDialog] = useState<"create" | "import" | "change" | "forgotten" | null>(null);

  const remove = async () => {
    if (!window.confirm(m.pgp_delete_confirm())) return;
    await actions
      .removeOwn()
      .catch((error: Error) => toast.show(m.common_error({ message: error.message }), "error"));
  };

  return (
    <SettingsCard title={m.pgp_own_title()} description={m.pgp_own_hint()}>
      {isPending ? null : own ? (
        <>
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
            <dt className="text-muted">{m.pgp_address()}</dt>
            <dd className="m-0">{own.email}</dd>
            <dt className="text-muted">{m.pgp_fingerprint()}</dt>
            <dd className="m-0 font-mono text-[13px] break-all">
              {groupFingerprint(own.fingerprint)}
            </dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() =>
                downloadText(own.publicKey, `${own.email}.asc`, "application/pgp-keys")
              }
            >
              <Download size={15} /> {m.pgp_download_public()}
            </Button>
            <Button variant="outline" onClick={() => setDialog("change")}>
              <KeyRound size={15} /> {m.pgp_change_passphrase()}
            </Button>
            <Button variant="ghost" onClick={() => setDialog("forgotten")}>
              {m.pgp_forgotten()}
            </Button>
            <Button variant="ghost" className="text-danger" onClick={() => void remove()}>
              {m.pgp_delete()}
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setDialog("create")}>
            <KeyRound size={15} /> {m.pgp_create()}
          </Button>
          <Button variant="outline" onClick={() => setDialog("import")}>
            {m.pgp_import()}
          </Button>
        </div>
      )}
      {dialog === "create" || dialog === "import" ? (
        <NewKeyDialog mode={dialog} onClose={() => setDialog(null)} />
      ) : null}
      {own && (dialog === "change" || dialog === "forgotten") ? (
        <PassphraseDialog
          own={own}
          forgotten={dialog === "forgotten"}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </SettingsCard>
  );
};
