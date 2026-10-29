/**
 * The composer's action bar. On a phone (below `md`) only send, attach, "Weitere Aktionen" and
 * discard stay in the row; the switches and "Als Entwurf speichern" move into the menu, so every
 * action fits on a 360–412 px screen. From `md` on, all of them stand in the row.
 */
import {
  LockKeyhole,
  LockKeyholeOpen,
  MailCheck,
  MoreHorizontal,
  PackageCheck,
  Paperclip,
  Save,
  Send,
  Signature,
  Trash2,
} from "lucide-react";
import { type ReactNode, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import { LOCALE } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { LINK_DAY_CHOICES } from "../pgp/use-encrypted-send";
import { SendLater } from "./send-later";

const ON = "bg-accent/10 text-accent-ink hover:bg-accent/15";
const WARN = "bg-warn/10 text-warn hover:bg-warn/15";

/** A switch of the mail being written: a pressed button on the desktop, a menu check on phones. */
type Toggle = {
  label: string;
  title: string;
  icon: ReactNode;
  on: boolean;
  onChange: (on: boolean) => void;
  /** The look while it is on. */
  onClass: string;
};

type Props = {
  receipt: boolean;
  onReceipt: (on: boolean) => void;
  /** Ask the receiving server for a delivery report (DSN). */
  delivery: boolean;
  onDelivery: (on: boolean) => void;
  encrypt: boolean;
  onEncrypt: (on: boolean) => void;
  /** Why it cannot be encrypted now, or null. */
  encryptBlocked: string | null;
  /** What happens to whom when sent confidentially. */
  encryptNote: string;
  /** How long the links of "Vertraulich senden" stay; null when no one gets a link. */
  linkDays: number | null;
  onLinkDays: (days: number) => void;
  /** Signed only, not encrypted; with what (null: no key or certificate for this address). */
  sign: boolean;
  onSign: (on: boolean) => void;
  signWith: "smime" | "pgp" | null;
  sending: boolean;
  canSend: boolean;
  onSendLater: (at: Date) => void;
  savedAt: Date | null;
  onAttach: (files: FileList | null) => void;
  /** Further ways to attach, beside the file picker (from Dokumente). */
  attachMore?: ReactNode;
  onSaveDraft: () => void;
  onDiscard: () => void;
};

const signNote = (signWith: "smime" | "pgp") =>
  signWith === "smime" ? m.sign_on_smime() : m.sign_on_pgp();

/** The switches that apply now, in the order they are shown. */
const togglesOf = (p: Props): Toggle[] => [
  {
    label: m.mail_receipt_request(),
    title: m.mail_receipt_request(),
    icon: <MailCheck size={16} />,
    on: p.receipt,
    onChange: p.onReceipt,
    onClass: ON,
  },
  {
    label: m.mail_dsn_request(),
    title: m.mail_dsn_request(),
    icon: <PackageCheck size={16} />,
    on: p.delivery,
    onChange: p.onDelivery,
    onClass: ON,
  },
  {
    label: m.pgp_send_toggle(),
    title: p.encrypt
      ? (p.encryptBlocked ?? `${p.encryptNote} ${m.pgp_send_draft_hint()}`)
      : m.pgp_send_toggle(),
    icon: p.encrypt ? <LockKeyhole size={16} /> : <LockKeyholeOpen size={16} />,
    on: p.encrypt,
    onChange: p.onEncrypt,
    onClass: p.encryptBlocked ? WARN : ON,
  },
  ...(!p.encrypt && p.signWith
    ? [
        {
          label: m.sign_toggle(),
          title: p.sign ? signNote(p.signWith) : m.sign_toggle(),
          icon: <Signature size={16} />,
          on: p.sign,
          onChange: p.onSign,
          onClass: ON,
        },
      ]
    : []),
];

/** Phones: the switches and "Als Entwurf speichern"; the trigger shows when a switch is on. */
const MoreMenu = ({ toggles, onSaveDraft }: { toggles: Toggle[]; onSaveDraft: () => void }) => {
  const active = toggles.find((toggle) => toggle.on);
  return (
    <MenuRoot>
      <MenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.mail_more()}
          title={m.mail_more()}
          className={cn("md:hidden", active?.onClass)}
        >
          <MoreHorizontal size={16} />
        </Button>
      </MenuTrigger>
      <MenuContent side="top" align="end">
        {toggles.map((toggle) => (
          <MenuCheckboxItem
            key={toggle.label}
            checked={toggle.on}
            onCheckedChange={(on) => toggle.onChange(on === true)}
          >
            {toggle.icon} {toggle.label}
          </MenuCheckboxItem>
        ))}
        <MenuSeparator />
        <MenuItem onSelect={onSaveDraft}>
          <Save size={16} /> {m.mail_save_draft()}
        </MenuItem>
      </MenuContent>
    </MenuRoot>
  );
};

/** Send, attach, the switches, the autosave note, save as draft and discard. */
export const ComposerActions = (props: Props) => {
  const {
    sending,
    canSend,
    onSendLater,
    savedAt,
    onAttach,
    attachMore,
    onSaveDraft,
    onDiscard,
    encrypt,
    encryptBlocked,
    encryptNote,
    linkDays,
    onLinkDays,
    sign,
    signWith,
  } = props;
  const fileInput = useRef<HTMLInputElement>(null);
  const toggles = togglesOf(props);
  return (
    <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
      <span className="flex">
        <Button
          type="submit"
          variant="primary"
          disabled={sending || !canSend}
          className="rounded-r-none"
        >
          <Send size={15} /> {sending ? m.mail_sending() : m.mail_send()}
        </Button>
        <SendLater disabled={sending || !canSend} onPick={onSendLater} />
      </span>
      <input
        ref={fileInput}
        type="file"
        multiple
        hidden
        onChange={(e) => onAttach(e.target.files)}
      />
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.mail_attach()}
        title={m.mail_attach()}
        onClick={() => fileInput.current?.click()}
      >
        <Paperclip size={16} />
      </Button>
      {attachMore}
      {toggles.map((toggle) => (
        <Button
          key={toggle.label}
          variant="ghost"
          size="icon"
          aria-label={toggle.label}
          title={toggle.title}
          aria-pressed={toggle.on}
          onClick={() => toggle.onChange(!toggle.on)}
          className={cn("hidden md:inline-flex", toggle.on && toggle.onClass)}
        >
          {toggle.icon}
        </Button>
      ))}
      <MoreMenu toggles={toggles} onSaveDraft={onSaveDraft} />
      {!encrypt && sign && signWith ? (
        <span role="status" className="hidden min-w-0 truncate text-[12px] text-accent sm:inline">
          {signNote(signWith)}
        </span>
      ) : null}
      {encrypt ? (
        <span
          role="status"
          className={`hidden min-w-0 truncate text-[12px] sm:inline ${encryptBlocked ? "text-warn" : "text-accent"}`}
        >
          {encryptBlocked ?? encryptNote}
        </span>
      ) : null}
      {encrypt && !encryptBlocked && linkDays !== null ? (
        <select
          aria-label={m.secure_link_days()}
          title={m.secure_link_days()}
          value={linkDays}
          onChange={(event) => onLinkDays(Number(event.target.value))}
          className="h-8 rounded-lg border border-border bg-bg px-2 text-[12px] text-fg"
        >
          {LINK_DAY_CHOICES.map((days) => (
            <option key={days} value={days}>
              {m.secure_link_days_option({ days })}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex-1" />
      {savedAt ? (
        <span role="status" className="hidden text-[12px] text-muted sm:inline">
          {m.mail_draft_autosaved({
            time: savedAt.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit" }),
          })}
        </span>
      ) : null}
      <Button variant="ghost" size="sm" className="hidden md:inline-flex" onClick={onSaveDraft}>
        {m.mail_save_draft()}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.mail_discard()}
        title={m.mail_discard()}
        onClick={onDiscard}
      >
        <Trash2 size={16} />
      </Button>
    </div>
  );
};
