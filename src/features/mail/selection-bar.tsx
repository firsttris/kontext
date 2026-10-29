/**
 * Above the list while mails are picked: what can be done with all of them at once. Mails of
 * several mailboxes ("Alle Posteingänge", search) are handled per mailbox; categories and moving
 * are offered when all are in one mailbox, as they belong to it.
 */

import { useNavigate } from "@tanstack/react-router";
import {
  Archive,
  FolderInput,
  ListChecks,
  Mail,
  MailOpen,
  Paperclip,
  ShieldAlert,
  ShieldCheck,
  Star,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { COLOR_STYLES } from "@/lib/categories";
import { cn } from "@/lib/cn";
import { correspondent } from "@/lib/correspondent";
import { moveTargets } from "@/lib/move-targets";
import {
  categoryState,
  groupsOf,
  marksFlagged,
  marksRead,
  type Picked,
  singleAccount,
} from "@/lib/selection";
import { mailLink, plainSubject } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { useCategories } from "../categories/queries";
import { TaskDialog, type TaskStart } from "../tasks/task-dialog";
import { useMailActions } from "./actions";
import { useAllMailboxes, useMailAccounts } from "./queries";

const IconButton = ({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) => (
  <Button
    variant="ghost"
    size="iconSm"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
  >
    {children}
  </Button>
);

export const SelectionBar = ({
  picked,
  allPicked,
  onPickAll,
  onClear,
  folderId,
  inJunk,
}: {
  picked: Picked[];
  allPicked: boolean;
  onPickAll: () => void;
  onClear: () => void;
  /** The open folder, where mails are taken out of; none in combined lists. */
  folderId?: string;
  inJunk: boolean;
}) => {
  const actions = useMailActions();
  const navigate = useNavigate();
  const toast = useToast();
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  const [tasks, setTasks] = useState<TaskStart[] | null>(null);
  const groups = groupsOf(picked, folderId);
  const accountId = singleAccount(picked);
  const categories = useCategories(accountId ?? undefined);
  const none = picked.length === 0;
  const read = marksRead(picked);
  const flag = marksFlagged(picked);
  const byAccount = [...new Set(picked.map((entry) => entry.accountId))].map((id) => ({
    id,
    ids: picked.filter((entry) => entry.accountId === id).map((entry) => entry.email.id),
  }));
  const targets =
    accountId && groups.length === 1
      ? moveTargets(accounts, mailboxes, { accountId, mailboxId: groups[0]!.from })
      : [];

  /** Runs for every group; a refusal (e.g. a mailbox only to read) is said once. */
  const run = async (action: () => Promise<unknown>[], clear: boolean) => {
    if (clear) onClear();
    const results = await Promise.allSettled(action());
    const failed = results.find((result) => result.status === "rejected");
    if (failed)
      toast.show(
        m.common_error({ message: String(failed.reason?.message ?? failed.reason) }),
        "error",
      );
  };

  const archiveAll = () =>
    groups.map((g) =>
      actions.archive(
        g.accountId,
        g.emails.map((e) => e.id),
        g.from,
      ),
    );

  /** All picked mails as .eml files in one new mail; the composer sends from their account. */
  const forwardAsFiles = (account: string) => {
    const emails = picked.map((entry) => entry.email.id).join(",");
    onClear();
    void navigate({
      to: ".",
      search: (prev) => ({ ...prev, compose: "forwardEml", emails, email: undefined, account }),
    });
  };

  /** One task per picked mail, linked to it and to its sender's card. */
  const makeTasks = () =>
    setTasks(
      picked.map(({ accountId: account, email }) => ({
        title: plainSubject(email.subject ?? ""),
        accountId: account,
        link: mailLink(account, email),
        person: correspondent(
          email,
          accounts.map((candidate) => candidate.name),
        )?.email,
      })),
    );

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1">
        <label className="flex size-8 cursor-pointer items-center justify-center rounded-lg hover:bg-hover">
          <input
            type="checkbox"
            ref={(box) => {
              if (box) box.indeterminate = !allPicked && !none;
            }}
            checked={allPicked}
            aria-label={m.mail_select_all()}
            onChange={allPicked ? onClear : onPickAll}
            className="size-4 cursor-pointer accent-[var(--primary)]"
          />
        </label>
        <span className="min-w-0 flex-1 truncate text-[14px] font-medium" aria-live="polite">
          {picked.length === 1 ? m.mail_selected_one() : m.mail_selected({ count: picked.length })}
        </span>
        <IconButton label={m.mail_selection_clear()} disabled={false} onClick={onClear}>
          <X size={15} />
        </IconButton>
      </div>
      <div className="flex flex-wrap items-center gap-0.5">
        <IconButton
          label={m.mail_archive_action()}
          disabled={none}
          onClick={() => void run(archiveAll, true)}
        >
          <Archive size={15} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label={m.mail_delete()}
          disabled={none}
          onClick={() =>
            void run(
              () =>
                groups.map((g) =>
                  actions.remove(
                    g.accountId,
                    g.emails.map((e) => e.id),
                    g.from,
                  ),
                ),
              true,
            )
          }
        >
          <Trash2 size={15} strokeWidth={1.75} />
        </IconButton>
        <IconButton
          label={inJunk ? m.mail_spam_unmark() : m.mail_spam_mark()}
          disabled={none}
          onClick={() =>
            void run(
              () =>
                groups.map((g) =>
                  actions.markSpam(
                    g.accountId,
                    g.emails.map((e) => e.id),
                    g.from,
                    !inJunk,
                  ),
                ),
              true,
            )
          }
        >
          {inJunk ? (
            <ShieldCheck size={15} strokeWidth={1.75} />
          ) : (
            <ShieldAlert size={15} strokeWidth={1.75} />
          )}
        </IconButton>
        <IconButton
          label={read ? m.mail_mark_read() : m.mail_mark_unread()}
          disabled={none}
          onClick={() =>
            void run(() => byAccount.map((a) => actions.setSeen(a.id, a.ids, read)), false)
          }
        >
          {read ? <MailOpen size={15} strokeWidth={1.75} /> : <Mail size={15} strokeWidth={1.75} />}
        </IconButton>
        <IconButton
          label={flag ? m.mail_flag() : m.mail_unflag()}
          disabled={none}
          onClick={() =>
            void run(() => byAccount.map((a) => actions.setFlagged(a.id, a.ids, flag)), false)
          }
        >
          <Star size={15} strokeWidth={1.75} className={flag ? undefined : "fill-warn text-warn"} />
        </IconButton>
        <IconButton label={m.mail_tasks_action()} disabled={none} onClick={makeTasks}>
          <ListChecks size={15} strokeWidth={1.75} />
        </IconButton>
        {accountId ? (
          <IconButton
            label={m.mail_forward_eml()}
            disabled={none}
            onClick={() => forwardAsFiles(accountId)}
          >
            <Paperclip size={15} strokeWidth={1.75} />
          </IconButton>
        ) : null}
        {accountId && categories.length ? (
          <MenuRoot>
            <MenuTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={m.categories_menu()}
                title={m.categories_menu()}
                disabled={none}
              >
                <Tag size={15} strokeWidth={1.75} />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {categories.map((category) => {
                const state = categoryState(picked, category);
                return (
                  <MenuCheckboxItem
                    key={category.keyword}
                    checked={state === "all" ? true : state === "some" ? "indeterminate" : false}
                    onCheckedChange={() =>
                      void run(
                        () => [
                          actions.setCategory(
                            accountId,
                            picked.map((entry) => entry.email.id),
                            category.keyword,
                            state !== "all",
                          ),
                        ],
                        false,
                      )
                    }
                  >
                    <span
                      aria-hidden="true"
                      className={cn("size-2.5 rounded-full", COLOR_STYLES[category.color].dot)}
                    />
                    {category.name}
                  </MenuCheckboxItem>
                );
              })}
            </MenuContent>
          </MenuRoot>
        ) : null}
        {targets.length ? (
          <MenuRoot>
            <MenuTrigger asChild>
              <Button
                variant="ghost"
                size="iconSm"
                aria-label={m.mail_move()}
                title={m.mail_move()}
                disabled={none}
              >
                <FolderInput size={15} strokeWidth={1.75} />
              </Button>
            </MenuTrigger>
            <MenuContent>
              {targets.map((group, index) => (
                <Fragment key={group.account.id}>
                  {index > 0 ? <MenuSeparator /> : null}
                  {targets.length > 1 ? <MenuLabel>{group.account.name}</MenuLabel> : null}
                  {group.targets.map((target) => (
                    <MenuItem
                      key={target.mailbox.id}
                      onSelect={() =>
                        void run(
                          () => [
                            actions.moveTo(accountId!, groups[0]!.emails, groups[0]!.from, {
                              accountId: target.accountId,
                              mailboxId: target.mailbox.id,
                            }),
                          ],
                          true,
                        )
                      }
                    >
                      {target.label}
                    </MenuItem>
                  ))}
                </Fragment>
              ))}
            </MenuContent>
          </MenuRoot>
        ) : null}
      </div>
      {tasks ? (
        <TaskDialog
          starts={tasks}
          onClose={() => setTasks(null)}
          onArchive={folderId ? () => run(archiveAll, true) : undefined}
        />
      ) : null}
    </div>
  );
};
