/** Left column: new mail, standard folders, shared mailboxes, own folders, storage. */
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlarmClock,
  Archive,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  Inbox,
  Layers,
  LockKeyhole,
  type LucideIcon,
  Plus,
  Send,
  ShieldAlert,
  SquarePen,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { Mailbox } from "@/jmap/types";
import { cn } from "@/lib/cn";
import { formatSize } from "@/lib/format";
import { mailboxNotice } from "@/lib/mail-accounts";
import {
  type FolderNode,
  flattenTree,
  folderTree,
  mailboxName,
  systemMailboxes,
} from "@/lib/mailboxes";
import { storageLevel } from "@/lib/storage";
import { m } from "@/paraglide/messages";
import { CategoryNav } from "../categories/category-nav";
import { useSecureMessages } from "../secure/queries";
import { useMailDrop } from "./mail-drag";
import { useCreateMailbox, useInboxes, useMailAccounts, useMailboxes, useQuota } from "./queries";

const ROLE_ICONS: Record<string, LucideIcon> = {
  inbox: Inbox,
  flagged: Star,
  snoozed: AlarmClock,
  drafts: File,
  sent: Send,
  archive: Archive,
  junk: ShieldAlert,
  trash: Trash2,
};

const navClass = (active: boolean) =>
  cn(
    "flex h-[34px] items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] no-underline hover:bg-hover",
    // A mail dragged over it (mail-drag.ts).
    "data-[drop-over]:bg-hover data-[drop-over]:text-fg data-[drop-over]:ring-1 data-[drop-over]:ring-accent",
    active ? "bg-subtle font-medium text-fg" : "text-muted",
  );

const Count = ({ value }: { value: number }) =>
  value > 0 ? <span className="ml-auto font-mono text-[12px] text-muted">{value}</span> : null;

type Props = {
  accountId: string;
  mailbox: Mailbox | undefined;
  /** A list over all accounts is open: "Alle Posteingänge" or the search. */
  view?: "unified" | "search";
  /** The open search's text, to mark a category whose search it is. */
  query?: string;
};

export const MailSidebar = ({ accountId, mailbox, view, query }: Props) => {
  const secure = useSecureMessages();
  const unified = view !== undefined;
  const { data: mailboxes = [] } = useMailboxes(accountId);
  const accounts = useMailAccounts();
  const inboxes = useInboxes();
  const account = accounts.find((candidate) => candidate.id === accountId);
  const dropTarget = useMailDrop();
  const [creating, setCreating] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const tree = folderTree(mailboxes);

  const toggle = (id: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const renderNode = (node: FolderNode) => {
    const hasChildren = node.children.length > 0;
    const open = !collapsed.has(node.mailbox.id);
    return (
      <li key={node.mailbox.id}>
        <div className="flex items-center">
          <Link
            to="/mail/$accountId/$mailboxId"
            params={{ accountId, mailboxId: node.mailbox.id }}
            {...dropTarget({ accountId, mailboxId: node.mailbox.id }, node.mailbox.name)}
            className={cn(navClass(node.mailbox.id === mailbox?.id), "h-8 flex-1")}
            style={{ paddingLeft: 10 + node.depth * 18 }}
          >
            <Folder size={16} strokeWidth={1.75} />
            <span className="truncate">{node.mailbox.name}</span>
            <Count value={node.mailbox.unreadEmails} />
          </Link>
          {hasChildren ? (
            <button
              type="button"
              aria-expanded={open}
              aria-label={node.mailbox.name}
              onClick={() => toggle(node.mailbox.id)}
              className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-hover"
            >
              {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          ) : null}
        </div>
        {hasChildren && open ? (
          <ul className="m-0 list-none p-0">{node.children.map(renderNode)}</ul>
        ) : null}
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-3 py-4">
      <div className="flex items-center gap-2">
        <Link
          to="/mail/$accountId/$mailboxId"
          params={{ accountId, mailboxId: mailbox?.id ?? "inbox" }}
          search={{}}
          aria-label={m.mail_back()}
          className="flex size-9 items-center justify-center rounded-lg text-muted hover:bg-hover md:hidden"
        >
          <ChevronLeft size={20} />
        </Link>
        <Button asChild variant="primary" className="h-[38px] flex-1">
          <Link
            to="/mail/$accountId/$mailboxId"
            params={{ accountId, mailboxId: mailbox?.id ?? "inbox" }}
            search={{ compose: "new" }}
          >
            <SquarePen size={15} /> {m.mail_compose()}
          </Link>
        </Button>
      </div>

      <nav aria-label={m.mail_inbox()} className="flex flex-col gap-px">
        {inboxes.length > 1 ? (
          <Link
            to="/mail/$accountId/$mailboxId"
            params={{ accountId: "all", mailboxId: "inbox" }}
            search={{}}
            aria-current={view === "unified" ? "page" : undefined}
            className={navClass(view === "unified")}
          >
            <Layers size={16} strokeWidth={1.75} />
            <span>{m.mail_all_inboxes()}</span>
            <Count value={inboxes.reduce((sum, inbox) => sum + inbox.mailbox.unreadEmails, 0)} />
          </Link>
        ) : null}
        {systemMailboxes(mailboxes).map((box) => {
          const Icon = ROLE_ICONS[box.role ?? ""] ?? Folder;
          return (
            <Link
              key={box.id}
              to="/mail/$accountId/$mailboxId"
              params={{ accountId, mailboxId: box.id }}
              {...(box.role === "drafts" || box.role === "flagged" || box.role === "snoozed"
                ? {}
                : dropTarget({ accountId, mailboxId: box.id }, mailboxName(box)))}
              className={navClass(box.id === mailbox?.id)}
            >
              <Icon size={16} strokeWidth={1.75} />
              <span>{mailboxName(box)}</span>
              {box.role === "inbox" || box.role === "junk" ? (
                <Count value={box.unreadEmails} />
              ) : null}
              {box.role === "drafts" || box.role === "snoozed" ? (
                <Count value={box.totalEmails} />
              ) : null}
            </Link>
          );
        })}
        {secure.length ? (
          <Link to="/secure" search={{}} className={navClass(false)}>
            <LockKeyhole size={16} strokeWidth={1.75} />
            <span>{m.secure_list_link()}</span>
            <Count value={secure.reduce((sum, message) => sum + message.unreadReplies, 0)} />
          </Link>
        ) : null}
      </nav>

      {accounts.length > 1 ? (
        <nav aria-label={m.mail_mailboxes()} className="flex flex-col gap-px">
          <div className="px-2.5 pb-1.5 text-[12px] font-medium text-muted">
            {m.mail_mailboxes()}
          </div>
          {accounts.map((entry) => {
            const inbox = inboxes.find((candidate) => candidate.account.id === entry.id)?.mailbox;
            // The full address, like everywhere else: a bare "info@" means nothing to most people.
            const label = entry.name;
            return (
              <Link
                key={entry.id}
                to="/mail/$accountId/$mailboxId"
                params={{ accountId: entry.id, mailboxId: "inbox" }}
                {...(inbox ? dropTarget({ accountId: entry.id, mailboxId: inbox.id }, label) : {})}
                title={mailboxNotice(entry)}
                className={navClass(!unified && entry.id === accountId)}
              >
                {entry.isPersonal ? (
                  <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
                ) : (
                  <Users size={15} strokeWidth={1.75} />
                )}
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}

      <nav aria-label={m.mail_folders()} className="flex flex-col gap-px">
        <div className="flex items-center pr-1 pb-1.5 pl-2.5">
          <span className="flex-1 truncate text-[12px] font-medium text-muted">
            {account && !account.isPersonal && !unified
              ? m.mail_folders_of({ name: account.name })
              : m.mail_folders()}
          </span>
          <button
            type="button"
            aria-label={m.mail_new_folder()}
            title={m.mail_new_folder()}
            onClick={() => setCreating(true)}
            className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
          >
            <Plus size={15} />
          </button>
        </div>
        <ul className="m-0 list-none p-0">{tree.map(renderNode)}</ul>
      </nav>

      {account ? (
        <CategoryNav
          accountId={account.id}
          mailbox={account.name}
          activeQuery={view === "search" ? query : undefined}
          navClass={navClass}
        />
      ) : null}

      <div className="flex-1" />
      {/* The own mailbox's storage is the ring around the avatar (account-avatar.tsx). */}
      {account && !account.isPersonal && !unified ? <StorageBar accountId={accountId} /> : null}
      <NewFolderDialog
        open={creating}
        onOpenChange={setCreating}
        accountId={accountId}
        parents={flattenTree(tree)}
        defaultParentId={mailbox && !mailbox.role ? mailbox.id : null}
      />
    </div>
  );
};

const StorageBar = ({ accountId }: { accountId: string }) => {
  const { data: quota } = useQuota(accountId);
  if (!quota) return null;
  const level = storageLevel(quota.used, quota.limit);
  return (
    <div className="flex flex-col gap-2 px-2.5">
      {level ? (
        <div className="h-1 overflow-hidden rounded-full bg-subtle">
          <div
            className={cn(
              "h-full rounded-full",
              level.tone === "full" ? "bg-danger" : level.tone === "warn" ? "bg-warn" : "bg-muted",
            )}
            style={{ width: `${Math.max(level.percent, 1.5)}%` }}
          />
        </div>
      ) : null}
      <div className="text-[12px] text-muted">
        {quota.limit
          ? m.mail_storage({ used: formatSize(quota.used), total: formatSize(quota.limit) })
          : formatSize(quota.used)}
      </div>
    </div>
  );
};

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  parents: FolderNode[];
  defaultParentId: string | null;
};

const NewFolderDialog = ({
  open,
  onOpenChange,
  accountId,
  parents,
  defaultParentId,
}: DialogProps) => {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>(defaultParentId ?? "");
  const create = useCreateMailbox(accountId);
  const toast = useToast();
  const navigate = useNavigate();

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    try {
      await create.mutateAsync({ name: name.trim(), parentId: parentId || null });
      setName("");
      onOpenChange(false);
      void navigate({ to: ".", search: (prev) => ({ ...prev, folders: undefined }) });
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setParentId(defaultParentId ?? "");
        onOpenChange(next);
      }}
      title={m.mail_new_folder()}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <Label>
          {m.mail_new_folder_name()}
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
        </Label>
        {parents.length > 0 ? (
          <Label>
            {m.mail_folders()}
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="h-10 rounded-lg border border-border bg-bg px-2 text-[14px] text-fg"
            >
              <option value="">—</option>
              {parents.map((node) => (
                <option key={node.mailbox.id} value={node.mailbox.id}>
                  {"  ".repeat(node.depth)}
                  {node.mailbox.name}
                </option>
              ))}
            </select>
          </Label>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {m.contacts_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={create.isPending}>
            {m.mail_new_folder()}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};
