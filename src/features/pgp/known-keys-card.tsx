/**
 * Settings: the public keys of others one knows – from mails (Autocrypt), found on the internet,
 * or brought in by hand –, with their fingerprint to compare and a note when one changed.
 */
import { AlertTriangle, Search, Trash2, Upload } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { groupFingerprint } from "@/lib/pgp";
import { m } from "@/paraglide/messages";
import { SettingsCard } from "../settings/settings-page";
import { useKnownKeys, usePgpActions } from "./queries";

const SOURCE_LABELS: Record<string, () => string> = {
  autocrypt: m.pgp_source_autocrypt,
  attachment: m.pgp_source_attachment,
  import: m.pgp_source_import,
  keyserver: m.pgp_source_keyserver,
  wkd: m.pgp_source_wkd,
};

export const KnownKeysCard = () => {
  const keys = useKnownKeys();
  const actions = usePgpActions();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const fail = (error: Error) => toast.show(m.common_error({ message: error.message }), "error");

  const find = async (event: FormEvent) => {
    event.preventDefault();
    if (!search.trim()) return;
    setBusy(true);
    try {
      const found = await actions.lookup(search.trim());
      if (!found.publicKey) {
        toast.show(m.pgp_lookup_none({ email: search.trim() }));
        return;
      }
      await actions.remember({
        publicKey: found.publicKey,
        source: found.source ?? "keyserver",
        email: search.trim().toLowerCase(),
      });
      toast.show(m.pgp_lookup_found({ email: search.trim() }));
      setSearch("");
    } catch (error) {
      fail(error as Error);
    } finally {
      setBusy(false);
    }
  };

  const bring = async (text: string) => {
    if (!text.trim()) return;
    try {
      await actions.remember({ publicKey: text.trim(), source: "import" });
      setPasted("");
      toast.show(m.pgp_import_done());
    } catch (error) {
      fail(error as Error);
    }
  };

  return (
    <SettingsCard title={m.pgp_known_title()} description={m.pgp_known_hint()}>
      {keys.length ? (
        <ul
          aria-label={m.pgp_known_title()}
          className="m-0 flex list-none flex-col divide-y divide-border p-0"
        >
          {keys.map((key) => (
            <li key={key.email} className="flex items-start gap-3 py-2.5">
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-[14px] font-medium">{key.email}</span>
                <span className="font-mono text-[12px] break-all text-muted">
                  {groupFingerprint(key.fingerprint)}
                </span>
                <span className="text-[12px] text-muted">
                  {SOURCE_LABELS[key.source]?.() ?? key.source}
                </span>
                {key.previousFingerprint ? (
                  <span className="flex items-center gap-1.5 text-[12px] text-warn">
                    <AlertTriangle size={13} aria-hidden="true" /> {m.pgp_key_changed()}
                  </span>
                ) : null}
              </span>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={m.pgp_forget({ email: key.email })}
                onClick={() => void actions.forget(key.email).catch(fail)}
              >
                <Trash2 size={14} />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="m-0 text-[13px] text-muted">{m.pgp_known_none()}</p>
      )}
      <form onSubmit={(event) => void find(event)} className="flex gap-2">
        <Input
          type="email"
          aria-label={m.pgp_lookup_label()}
          placeholder={m.pgp_lookup_placeholder()}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Button type="submit" variant="outline" disabled={busy || !search.trim()}>
          <Search size={15} /> {m.pgp_lookup()}
        </Button>
      </form>
      <div className="flex flex-col gap-2">
        <Textarea
          rows={3}
          aria-label={m.pgp_import_public()}
          placeholder="-----BEGIN PGP PUBLIC KEY BLOCK-----"
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          className="font-mono text-[12px]"
        />
        <div className="flex gap-2">
          <Button variant="outline" disabled={!pasted.trim()} onClick={() => void bring(pasted)}>
            {m.pgp_import_public()}
          </Button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3 text-[14px] text-muted hover:bg-hover hover:text-fg">
            <Upload size={15} /> {m.pgp_import_file()}
            <input
              type="file"
              accept=".asc,.gpg,.pgp,application/pgp-keys"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void file.text().then(bring);
                event.target.value = "";
              }}
            />
          </label>
        </div>
      </div>
    </SettingsCard>
  );
};
