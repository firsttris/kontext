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
  MoreHorizontal,
  Printer,
  Reply,
  ReplyAll,
  ShieldAlert,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
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
import { useShortcuts } from "@/components/use-shortcuts";
import { isFlagged } from "@/jmap/mail";
import type { EmailDetail, Mailbox } from "@/jmap/types";
import { shortAddress } from "@/lib/mail-accounts";
import { mailboxRights } from "@/lib/mailboxes";
import { moveTargets } from "@/lib/move-targets";
import { type Rule, ruleFromSender } from "@/lib/rules";
import { mailLink, plainSubject } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { CategoryMenu } from "../categories/category-menu";
import { OwnRuleDialog } from "../rules/rule-dialog";
import { usePersonalAccountId } from "../settings/queries";
import { TaskDialog, type TaskStart } from "../tasks/task-dialog";
import { useEmailActions } from "./actions";
import { usePrintMail } from "./print-mail";
import { useAllMailboxes, useMailAccounts } from "./queries";

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
  const newTask = () =>
    setTask({
      title: plainSubject(email.subject ?? ""),
      accountId,
      link: mailLink(accountId, email),
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
  const mailboxLabel = !account
    ? ""
    : account.isPersonal
      ? account.name
      : shortAddress(account.name);
  const groups = moveTargets(accounts, mailboxes, { accountId, mailboxId: mailbox.id });
  const flagged = isFlagged(email);
  const { canRemove, canMarkSeen, canFlag } = mailboxRights(mailbox);
  // In Spam the same button takes a mail back out; own sent mail is no spam.
  const inJunk = mailbox.role === "junk";
  const toggleSpam =
    canRemove && mailbox.role !== "sent"
      ? () =>
          void run(async () => {
            await actions.markSpam([email.id], mailbox.id, !inJunk);
            toast.show(inJunk ? m.mail_spam_unmarked() : m.mail_spam_marked());
          }, true)
      : undefined;
  const compose = (mode: "reply" | "replyAll" | "forward") =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, compose: mode }) });
  const printMail = usePrintMail();
  const print = () => void run(() => printMail(accountId, email), false);

  useShortcuts({
    r: () => compose("reply"),
    a: () => compose("replyAll"),
    f: () => compose("forward"),
    e:
      canRemove && mailbox.role !== "archive"
        ? () => void run(() => actions.archive([email.id], mailbox.id), true)
        : undefined,
    "#": canRemove ? () => void run(() => actions.remove([email.id], mailbox.id), true) : undefined,
    s: canFlag ? () => void run(() => actions.setFlagged([email.id], !flagged), false) : undefined,
    U: canMarkSeen ? () => void run(() => actions.setSeen([email.id], false), true) : undefined,
    "!": toggleSpam,
    p: print,
    t: newTask,
    esc: () => void close(),
  });

  // Ctrl+P (Cmd+P) prints the mail, not the whole app around it.
  const printRef = useRef(print);
  printRef.current = print;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        printRef.current();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

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
      {canRemove && mailbox.role !== "archive" ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label={m.mail_archive_action()}
          title={m.mail_archive_action()}
          onClick={() => run(() => actions.archive([email.id], mailbox.id), true)}
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
          onClick={() => run(() => actions.remove([email.id], mailbox.id), true)}
        >
          <Trash2 size={16} strokeWidth={1.75} />
        </Button>
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
          onClick={() => run(() => actions.setSeen([email.id], false), true)}
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
      {canFlag ? <CategoryMenu accountId={accountId} mailbox={mailboxLabel} email={email} /> : null}
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.tasks_from_mail_title()}
        title={`${m.tasks_from_mail_title()} (t)`}
        onClick={newTask}
      >
        <ListChecks size={16} strokeWidth={1.75} />
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
                          actions.moveTo([email], mailbox.id, {
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
      <div className="flex-1" />
      <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
        <Link to="." search={(prev) => ({ ...prev, compose: "reply" })}>
          <Reply size={15} /> {m.mail_reply()}
        </Link>
      </Button>
      <MenuRoot>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={m.mail_more()}>
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
          <MenuItem onSelect={print}>
            <Printer size={15} /> {m.mail_print()}
          </MenuItem>
          {canMarkSeen ? (
            <>
              <MenuSeparator />
              <MenuItem onSelect={() => run(() => actions.setSeen([email.id], false), true)}>
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
      {task ? (
        <TaskDialog
          start={task}
          onClose={() => setTask(null)}
          onArchive={
            canRemove && mailbox.role !== "archive"
              ? () => run(() => actions.archive([email.id], mailbox.id), true)
              : undefined
          }
        />
      ) : null}
    </div>
  );
};
