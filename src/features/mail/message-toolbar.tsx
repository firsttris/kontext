/** The reading pane's toolbar: archive, delete, spam, read, flag, move, reply and the shortcuts. */
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Archive,
  ChevronLeft,
  FolderInput,
  Forward,
  ListChecks,
  ListFilter,
  MailOpen,
  MessagesSquare,
  MoreHorizontal,
  Paperclip,
  Printer,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { usePrintKey } from "@/components/use-print-key";
import { useShortcuts } from "@/components/use-shortcuts";
import { isFlagged } from "@/jmap/mail";
import type { EmailDetail, EmailSummary, Mailbox } from "@/jmap/types";
import { correspondent } from "@/lib/correspondent";
import { mailboxRights } from "@/lib/mailboxes";
import { moveTargets } from "@/lib/move-targets";
import { type Rule, ruleFromSender } from "@/lib/rules";
import { mailLink, plainSubject } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { CategoryMenu } from "../categories/category-menu";
import { DiscussDialog } from "../chat/discuss-dialog";
import { OwnRuleDialog } from "../rules/rule-dialog";
import { usePersonalAccountId } from "../settings/queries";
import { SnoozeMenu } from "../snooze/snooze-menu";
import { TaskDialog, type TaskStart } from "../tasks/task-dialog";
import { useEmailActions } from "./actions";
import { useThread } from "./conversation";
import { usePrintMail } from "./print-mail";
import { useAllMailboxes, useMailAccounts } from "./queries";
import { useRemoteImages } from "./remote-images";
import { useThreadView } from "./thread-view";

export const Toolbar = ({
  accountId,
  mailbox,
  email,
}: {
  accountId: string;
  mailbox: Mailbox;
  email: EmailDetail;
}) => {
  const actions = useEmailActions(accountId);
  const navigate = useNavigate();
  const toast = useToast();
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  // Rules run on the own mailbox only, so they are offered for its mails.
  const ownMailbox = usePersonalAccountId() === accountId;
  const sender = email.from?.[0]?.email;
  const [rule, setRule] = useState<Rule | null>(null);
  const [task, setTask] = useState<TaskStart | null>(null);
  const [discussing, setDiscussing] = useState(false);
  // Grouped as conversations: what one does to the line, one does to all of it in this folder.
  const grouped = useThreadView();
  const thread = useThread(accountId, grouped ? email.threadId : undefined);
  const inFolder = (thread ?? []).filter((mail) => mail.mailboxIds[mailbox.id]);
  const targets: EmailSummary[] = grouped && inFolder.length ? inFolder : [email];
  const ids = targets.map((mail) => mail.id);
  const newTask = () =>
    setTask({
      title: plainSubject(email.subject ?? ""),
      accountId,
      link: mailLink(accountId, email),
      person: correspondent(
        email,
        accounts.map((account) => account.name),
      )?.email,
    });
  const close = () =>
    navigate({ to: ".", search: (prev) => ({ ...prev, email: undefined, compose: undefined }) });

  const run = async (action: () => Promise<unknown>, leave: boolean) => {
    try {
      if (leave) await close();
      await action();
    } catch (error) {
      toast.show(m.common_error({ message: (error as Error).message }), "error");
    }
  };

  const account = accounts.find((candidate) => candidate.id === accountId);
  const mailboxLabel = account?.name ?? "";
  const groups = moveTargets(accounts, mailboxes, { accountId, mailboxId: mailbox.id });
  const flagged = isFlagged(email);
  const { canRemove, canMarkSeen, canFlag } = mailboxRights(mailbox);
  // In Spam the same button takes a mail back out; own sent mail is no spam.
  const inJunk = mailbox.role === "junk";
  const toggleSpam =
    canRemove && mailbox.role !== "sent"
      ? () =>
          void run(async () => {
            await actions.markSpam(ids, mailbox.id, !inJunk);
            toast.show(inJunk ? m.mail_spam_unmarked() : m.mail_spam_marked());
          }, true)
      : undefined;
  const compose = (mode: "reply" | "replyAll" | "forward") =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, compose: mode }) });
  const printMail = usePrintMail();
  const { allowRemote } = useRemoteImages(email);
  const print = () => void run(() => printMail(accountId, email, allowRemote), false);

  useShortcuts({
    r: () => compose("reply"),
    a: () => compose("replyAll"),
    f: () => compose("forward"),
    e:
      canRemove && mailbox.role !== "archive"
        ? () => void run(() => actions.archive(ids, mailbox.id), true)
        : undefined,
    "#": canRemove ? () => void run(() => actions.remove(ids, mailbox.id), true) : undefined,
    s: canFlag ? () => void run(() => actions.setFlagged([email.id], !flagged), false) : undefined,
    U: canMarkSeen ? () => void run(() => actions.setSeen(ids, false), true) : undefined,
    "!": toggleSpam,
    p: print,
    t: newTask,
    b: () => setDiscussing(true),
    esc: () => void close(),
  });

  usePrintKey(print);

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 md:px-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.mail_back()}
        className="md:hidden"
        onClick={() => close()}
      >
        <ChevronLeft size={20} />
      </Button>
      {/* On a phone the icons do not all fit: they scroll sideways, "Mehr" stays in reach. */}
      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none]">
        {canRemove && mailbox.role !== "archive" ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.mail_archive_action()}
            title={m.mail_archive_action()}
            onClick={() => run(() => actions.archive(ids, mailbox.id), true)}
          >
            <Archive size={16} strokeWidth={1.75} />
          </Button>
        ) : null}
        {canRemove ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.mail_delete()}
            title={m.mail_delete()}
            onClick={() => run(() => actions.remove(ids, mailbox.id), true)}
          >
            <Trash2 size={16} strokeWidth={1.75} />
          </Button>
        ) : null}
        {canRemove && mailbox.role !== "drafts" && mailbox.role !== "sent" ? (
          <SnoozeMenu
            accountId={accountId}
            ids={ids}
            from={mailbox.id}
            onLeave={mailbox.role === "snoozed" ? undefined : close}
            shortcut
          />
        ) : null}
        {toggleSpam ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={inJunk ? m.mail_spam_unmark() : m.mail_spam_mark()}
            title={inJunk ? m.mail_spam_unmark() : m.mail_spam_mark()}
            onClick={toggleSpam}
          >
            {inJunk ? (
              <ShieldCheck size={16} strokeWidth={1.75} />
            ) : (
              <ShieldAlert size={16} strokeWidth={1.75} />
            )}
          </Button>
        ) : null}
        {canMarkSeen ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={m.mail_mark_unread()}
            title={m.mail_mark_unread()}
            // On a phone it is in "Mehr" only, one icon fewer to scroll past.
            className="hidden sm:inline-flex"
            onClick={() => run(() => actions.setSeen(ids, false), true)}
          >
            <MailOpen size={16} strokeWidth={1.75} />
          </Button>
        ) : null}
        {canFlag ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={flagged ? m.mail_unflag() : m.mail_flag()}
            aria-pressed={flagged}
            title={flagged ? m.mail_unflag() : m.mail_flag()}
            onClick={() => run(() => actions.setFlagged([email.id], !flagged), false)}
          >
            <Star
              size={16}
              strokeWidth={1.75}
              className={flagged ? "fill-warn text-warn" : undefined}
            />
          </Button>
        ) : null}
        {canFlag ? (
          <CategoryMenu accountId={accountId} mailbox={mailboxLabel} email={email} />
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.tasks_from_mail_title()}
          title={`${m.tasks_from_mail_title()} (t)`}
          onClick={newTask}
        >
          <ListChecks size={16} strokeWidth={1.75} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.chat_discuss()}
          title={`${m.chat_discuss()} (b)`}
          onClick={() => setDiscussing(true)}
        >
          <MessagesSquare size={16} strokeWidth={1.75} />
        </Button>
        {canRemove ? (
          <MenuRoot>
            <MenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={m.mail_move()} title={m.mail_move()}>
                <FolderInput size={16} strokeWidth={1.75} />
              </Button>
            </MenuTrigger>
            <MenuContent align="start">
              {groups.length === 1 ? <MenuLabel>{m.mail_move()}</MenuLabel> : null}
              {groups.map((group, index) => (
                <Fragment key={group.account.id}>
                  {groups.length > 1 ? (
                    <>
                      {index > 0 ? <MenuSeparator /> : null}
                      <MenuLabel>
                        {group.account.isPersonal ? m.mail_own_mailbox() : group.account.name}
                      </MenuLabel>
                    </>
                  ) : null}
                  {group.targets.map((target) => (
                    <MenuItem
                      key={target.mailbox.id}
                      onSelect={() =>
                        run(
                          () =>
                            actions.moveTo(targets, mailbox.id, {
                              accountId: target.accountId,
                              mailboxId: target.mailbox.id,
                            }),
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
      <Button asChild variant="outline" size="sm" className="hidden shrink-0 sm:inline-flex">
        <Link to="." search={(prev) => ({ ...prev, compose: "reply" })}>
          <Reply size={15} /> {m.mail_reply()}
        </Link>
      </Button>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={m.mail_more()} className="shrink-0">
            <MoreHorizontal size={16} />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem
            onSelect={() =>
              navigate({ to: ".", search: (prev) => ({ ...prev, compose: "reply" }) })
            }
          >
            <Reply size={15} /> {m.mail_reply()}
          </MenuItem>
          <MenuItem
            onSelect={() =>
              navigate({ to: ".", search: (prev) => ({ ...prev, compose: "replyAll" }) })
            }
          >
            <ReplyAll size={15} /> {m.mail_reply_all()}
          </MenuItem>
          <MenuItem
            onSelect={() =>
              navigate({ to: ".", search: (prev) => ({ ...prev, compose: "forward" }) })
            }
          >
            <Forward size={15} /> {m.mail_forward()}
          </MenuItem>
          <MenuItem
            onSelect={() =>
              navigate({ to: ".", search: (prev) => ({ ...prev, compose: "forwardEml" }) })
            }
          >
            <Paperclip size={15} /> {m.mail_forward_eml()}
          </MenuItem>
          <MenuItem onSelect={print}>
            <Printer size={15} /> {m.mail_print()}
          </MenuItem>
          {canMarkSeen ? (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => run(() => actions.setSeen(ids, false), true)}>
                <MailOpen size={15} /> {m.mail_mark_unread()}
              </MenuItem>
            </>
          ) : null}
          {ownMailbox && sender ? (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => setRule(ruleFromSender(crypto.randomUUID(), sender))}>
                <ListFilter size={15} /> {m.rules_from_mail()}
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </MenuRoot>
      {rule ? <OwnRuleDialog initial={rule} onClose={() => setRule(null)} /> : null}
      {discussing ? (
        <DiscussDialog accountId={accountId} email={email} onClose={() => setDiscussing(false)} />
      ) : null}
      {task ? (
        <TaskDialog
          starts={[task]}
          onClose={() => setTask(null)}
          onArchive={
            canRemove && mailbox.role !== "archive"
              ? () => run(() => actions.archive(ids, mailbox.id), true)
              : undefined
          }
        />
      ) : null}
    </div>
  );
};
