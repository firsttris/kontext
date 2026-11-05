/**
 * A folder's row in the sidebar with its menu behind "…" (on hover on a desktop, always on a
 * phone, where the sidebar is the folder screen). Own folders can be renamed, moved and deleted; every folder with unread
 * mails can be marked read. What is offered follows `folderActions` (src/lib/mailboxes.ts).
 */
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { CheckCheck, Ellipsis, FolderInput, Pencil, Trash2 } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { MenuContent, MenuItem, MenuRoot, MenuTrigger } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { deleteMailboxes, markMailboxRead, updateMailbox } from "@/jmap/folders";
import type { Mailbox } from "@/jmap/types";
import {
  type FolderNode,
  findRole,
  folderActions,
  mailboxName,
  moveTargets,
  subfolders,
} from "@/lib/mailboxes";
import { m } from "@/paraglide/messages";

type Props = {
  accountId: string;
  mailbox: Mailbox;
  mailboxes: Mailbox[];
  /** The open folder: when it is deleted, the inbox opens instead. */
  activeId: string | undefined;
  children: ReactNode;
};

export const FolderRow = ({ accountId, mailbox, mailboxes, activeId, children }: Props) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<"rename" | "move" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const actions = folderActions(mailbox, mailboxes);
  const name = mailboxName(mailbox);

  if (!actions.rename && !actions.remove && !actions.markRead)
    return <div className="flex items-center">{children}</div>;

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      setDialog(null);
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: [accountId] });
    }
  };

  const remove = async () => {
    const ids = [mailbox, ...subfolders(mailbox, mailboxes)].map((box) => box.id);
    await deleteMailboxes(client, accountId, ids.reverse(), findRole(mailboxes, "trash")?.id);
    toast.show(m.mail_folder_deleted());
    if (activeId && ids.includes(activeId))
      void navigate({
        to: "/mail/$accountId/$mailboxId",
        params: { accountId, mailboxId: "inbox" },
      });
  };

  return (
    <div className="group flex items-center">
      {children}
      <MenuRoot>
        <MenuTrigger
          aria-label={m.mail_folder_menu({ name })}
          className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg focus-visible:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-hover:opacity-100"
        >
          <Ellipsis size={15} />
        </MenuTrigger>
        <MenuContent aria-label={m.mail_folder_menu({ name })}>
          {actions.markRead ? (
            <MenuItem
              onSelect={() => void run(() => markMailboxRead(client, accountId, mailbox.id))}
            >
              <CheckCheck size={15} /> {m.mail_mark_all_read()}
            </MenuItem>
          ) : null}
          {actions.rename ? (
            <>
              <MenuItem onSelect={() => setDialog("rename")}>
                <Pencil size={15} /> {m.mail_folder_rename()}
              </MenuItem>
              <MenuItem onSelect={() => setDialog("move")}>
                <FolderInput size={15} /> {m.mail_folder_move()}
              </MenuItem>
            </>
          ) : null}
          {actions.remove ? (
            <MenuItem onSelect={() => setDialog("delete")} className="text-danger">
              <Trash2 size={15} /> {m.mail_folder_delete()}
            </MenuItem>
          ) : null}
        </MenuContent>
      </MenuRoot>
      {dialog === "rename" || dialog === "move" ? (
        <EditFolderDialog
          kind={dialog}
          mailbox={mailbox}
          targets={dialog === "move" ? moveTargets(mailbox, mailboxes) : []}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={(patch) => run(() => updateMailbox(client, accountId, mailbox.id, patch))}
        />
      ) : null}
      {dialog === "delete" ? (
        <Dialog
          open
          onOpenChange={() => setDialog(null)}
          title={m.mail_folder_delete_title({ name })}
          description={deleteHint(mailbox, mailboxes)}
        >
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => setDialog(null)}>
              {m.contacts_cancel()}
            </Button>
            <Button variant="danger" disabled={busy} onClick={() => void run(remove)}>
              {m.mail_folder_delete()}
            </Button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
};

/** What deleting takes along: the mails (to the Papierkorb) and the subfolders. */
const deleteHint = (mailbox: Mailbox, mailboxes: Mailbox[]): string | undefined => {
  const children = subfolders(mailbox, mailboxes);
  const mails = [mailbox, ...children].reduce((sum, box) => sum + box.totalEmails, 0);
  const parts = [
    mails === 1 ? m.mail_folder_delete_mails_one() : "",
    mails > 1 ? m.mail_folder_delete_mails({ count: mails }) : "",
    children.length ? m.mail_folder_delete_subfolders() : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" ") : undefined;
};

type EditProps = {
  kind: "rename" | "move";
  mailbox: Mailbox;
  targets: FolderNode[];
  busy: boolean;
  onClose: () => void;
  onSave: (patch: { name?: string; parentId?: string | null }) => void;
};

const EditFolderDialog = ({ kind, mailbox, targets, busy, onClose, onSave }: EditProps) => {
  const [name, setName] = useState(mailbox.name);
  const [parentId, setParentId] = useState(mailbox.parentId ?? "");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (kind === "rename" && name.trim()) onSave({ name: name.trim() });
    if (kind === "move") onSave({ parentId: parentId || null });
  };
  const title = kind === "rename" ? m.mail_folder_rename() : m.mail_folder_move();
  return (
    <Dialog open onOpenChange={onClose} title={`${mailbox.name}: ${title}`}>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {kind === "rename" ? (
          <Label>
            {m.mail_new_folder_name()}
            <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} required />
          </Label>
        ) : (
          <ParentSelect value={parentId} onChange={setParentId} options={targets} />
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {m.contacts_cancel()}
          </Button>
          <Button type="submit" variant="primary" disabled={busy}>
            {title}
          </Button>
        </div>
      </form>
    </Dialog>
  );
};

/** The parent of a new or moved folder; "—" is the top level. */
export const ParentSelect = ({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (id: string) => void;
  options: FolderNode[];
}) => (
  <Label>
    {m.mail_folders()}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-lg border border-border bg-bg px-2 text-[14px] text-fg"
    >
      <option value="">—</option>
      {options.map((node) => (
        <option key={node.mailbox.id} value={node.mailbox.id}>
          {"  ".repeat(node.depth)}
          {mailboxName(node.mailbox)}
        </option>
      ))}
    </select>
  </Label>
);
