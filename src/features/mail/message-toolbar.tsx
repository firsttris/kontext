/**
 * The reading pane's toolbar: archive and delete with their names, snooze, flag and assign as
 * icons, reply, and everything else under "Weitere Aktionen" (message-more-menu.tsx); the
 * shortcuts for all of them.
 */
import { Link, useNavigate } from "@tanstack/react-router";
import { Archive, ChevronLeft, Reply, Star, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { usePrintKey } from "@/components/use-print-key";
import { useShortcuts } from "@/components/use-shortcuts";
import { isFlagged } from "@/jmap/mail";
import type { EmailDetail, EmailSummary, Mailbox } from "@/jmap/types";
import { correspondent } from "@/lib/correspondent";
import { domainOf, isExternal } from "@/lib/external-hint";
import { canAssignIn, mailboxRights } from "@/lib/mailboxes";
import { moveTargets } from "@/lib/move-targets";
import { type BlockScope, type Rule, ruleFromSender } from "@/lib/rules";
import { mailLink, plainSubject } from "@/lib/tasks";
import { m } from "@/paraglide/messages";
import { CategoryDialog } from "../categories/category-dialog";
import { CategorySubmenu } from "../categories/category-menu";
import { DiscussDialog } from "../chat/discuss-dialog";
import { useExternalHint } from "../company/external-hint";
import { useBlockSender } from "../rules/block-sender";
import { OwnRuleDialog } from "../rules/rule-dialog";
import { usePersonalAccountId } from "../settings/queries";
import { SnoozeMenu } from "../snooze/snooze-menu";
import { TaskDialog, type TaskStart } from "../tasks/task-dialog";
import { useEmailActions } from "./actions";
import { AssignMenu } from "./assignment";
import { useThread } from "./conversation";
import { type ComposeMode, MoreMenu } from "./message-more-menu";
import { usePrintMail } from "./print-mail";
import { useAllMailboxes, useMailAccounts } from "./queries";
import { useRemoteImages } from "./remote-images";
import { useReportPhishing } from "./report-phishing";
import { useThreadView } from "./thread-view";
import { useOfferUndo } from "./undo";

/** Closes the open mail (and its composer): back to the list. */
export const useCloseMail = () => {
  const navigate = useNavigate();
  return () =>
    navigate({ to: ".", search: (prev) => ({ ...prev, email: undefined, compose: undefined }) });
};

/**
 * An icon with its name beside it, for the actions used most. The name gives way where the pane
 * is narrow (a phone, a tablet's split view); the icon keeps it as its label.
 */
const LabelledButton = ({
  label,
  shortcut,
  onClick,
  children,
}: {
  label: string;
  shortcut: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <Button
    variant="ghost"
    aria-label={label}
    title={`${label} (${shortcut})`}
    className="size-9 px-0 @[34rem]:w-auto @[34rem]:gap-1.5 @[34rem]:px-2.5"
    onClick={onClick}
  >
    {children}
    <span className="hidden @[34rem]:inline">{label}</span>
  </Button>
);

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
  const offerUndo = useOfferUndo();
  const accounts = useMailAccounts();
  const mailboxes = useAllMailboxes();
  // Rules run on the own mailbox only, so they are offered for its mails.
  const ownMailbox = usePersonalAccountId() === accountId;
  const sender = email.from?.[0]?.email;
  const [rule, setRule] = useState<Rule | null>(null);
  const [task, setTask] = useState<TaskStart | null>(null);
  const [discussing, setDiscussing] = useState(false);
  // Outside the menu: the menu and all in it go away when the dialog opens.
  const [editingCategories, setEditingCategories] = useState(false);
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
  const close = useCloseMail();

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
  // In Spam the same action takes a mail back out; own sent mail is no spam.
  const inJunk = mailbox.role === "junk";
  const toggleSpam =
    canRemove && mailbox.role !== "sent"
      ? () =>
          void run(async () => {
            const move = await actions.markSpam(ids, mailbox.id, !inJunk);
            offerUndo(inJunk ? m.mail_spam_unmarked() : m.mail_spam_marked(), [move]);
          }, true)
      : undefined;
  const blockSender = useBlockSender(accountId);
  const { data: company } = useExternalHint();
  // Colleagues and shared mailboxes are not blocked: the company's domains and the mailboxes' own.
  const ownDomains = [
    ...(company?.domains ?? []),
    ...accounts.map((candidate) => domainOf(candidate.name)),
  ];
  const block =
    ownMailbox && sender && blockSender && isExternal(sender, ownDomains)
      ? {
          address: sender,
          domain: domainOf(sender),
          run: (scope: BlockScope) =>
            void run(
              async () => {
                await blockSender(sender, scope);
                const text = m.mail_sender_blocked({
                  sender: scope === "address" ? sender : domainOf(sender),
                });
                if (inJunk || !toggleSpam) return toast.show(text, "info");
                offerUndo(text, [await actions.markSpam(ids, mailbox.id, true)]);
              },
              Boolean(toggleSpam && !inJunk),
            ),
        }
      : undefined;
  const report = useReportPhishing(accountId, email, mailbox.id);
  const reportPhishing = report && toggleSpam && !inJunk ? () => void run(report, true) : undefined;
  const compose = (mode: ComposeMode) =>
    void navigate({ to: ".", search: (prev) => ({ ...prev, compose: mode }) });
  const printMail = usePrintMail();
  const { allowRemote } = useRemoteImages(email);
  const print = () => void run(() => printMail(accountId, email, allowRemote), false);
  const archive =
    canRemove && mailbox.role !== "archive"
      ? () =>
          run(
            async () => offerUndo(m.mail_archived(), [await actions.archive(ids, mailbox.id)]),
            true,
          )
      : undefined;
  const remove = canRemove
    ? () =>
        void run(
          async () => offerUndo(m.mail_trashed(), [await actions.remove(ids, mailbox.id)]),
          true,
        )
    : undefined;
  const markUnread = canMarkSeen
    ? () => void run(() => actions.setSeen(ids, false), true)
    : undefined;
  const toggleFlag = () => void run(() => actions.setFlagged([email.id], !flagged), false);

  useShortcuts({
    r: () => compose("reply"),
    a: () => compose("replyAll"),
    f: () => compose("forward"),
    e: archive,
    "#": remove,
    s: canFlag ? toggleFlag : undefined,
    U: markUnread,
    "!": toggleSpam,
    p: print,
    t: newTask,
    b: () => setDiscussing(true),
  });

  usePrintKey(print);

  return (
    // A container: the names show where the pane is wide enough, whatever the screen's width.
    <div className="@container flex h-12 shrink-0 items-center gap-1 border-b border-border px-2 md:px-3">
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.mail_back()}
        className="md:hidden"
        onClick={() => close()}
      >
        <ChevronLeft size={20} />
      </Button>
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {archive ? (
          <LabelledButton label={m.mail_archive_action()} shortcut="e" onClick={archive}>
            <Archive size={16} strokeWidth={1.75} />
          </LabelledButton>
        ) : null}
        {remove ? (
          <LabelledButton label={m.mail_delete()} shortcut="#" onClick={remove}>
            <Trash2 size={16} strokeWidth={1.75} />
          </LabelledButton>
        ) : null}
        {canRemove && mailbox.role !== "drafts" && mailbox.role !== "sent" ? (
          <SnoozeMenu
            targets={[{ accountId, ids, from: mailbox.id }]}
            onLeave={mailbox.role === "snoozed" ? undefined : close}
            shortcut
          />
        ) : null}
        {canFlag ? (
          <Button
            variant="ghost"
            size="icon"
            aria-label={flagged ? m.mail_unflag() : m.mail_flag()}
            aria-pressed={flagged}
            title={`${flagged ? m.mail_unflag() : m.mail_flag()} (s)`}
            onClick={toggleFlag}
          >
            <Star
              size={16}
              strokeWidth={1.75}
              className={flagged ? "fill-warn text-warn" : undefined}
            />
          </Button>
        ) : null}
        {canAssignIn(mailbox) && account && !account.isPersonal ? (
          <AssignMenu accountId={accountId} email={email} />
        ) : null}
      </div>
      <Button asChild variant="outline" size="sm" className="hidden shrink-0 sm:inline-flex">
        <Link to="." search={(prev) => ({ ...prev, compose: "reply" })}>
          <Reply size={15} /> {m.mail_reply()}
        </Link>
      </Button>
      <MoreMenu
        compose={compose}
        print={print}
        markUnread={markUnread}
        spam={toggleSpam ? { undo: inJunk, run: toggleSpam } : undefined}
        reportPhishing={reportPhishing}
        block={block}
        move={
          canRemove
            ? {
                groups,
                onPick: (target) =>
                  void run(async () => {
                    const move = await actions.moveTo(targets, mailbox.id, {
                      accountId: target.accountId,
                      mailboxId: target.mailbox.id,
                    });
                    offerUndo(m.mail_moved({ folder: target.label }), [move]);
                  }, true),
              }
            : undefined
        }
        categories={
          canFlag ? (
            <CategorySubmenu
              accountId={accountId}
              email={email}
              onEdit={() => setEditingCategories(true)}
            />
          ) : undefined
        }
        newTask={newTask}
        discuss={() => setDiscussing(true)}
        newRule={
          ownMailbox && sender
            ? () => setRule(ruleFromSender(crypto.randomUUID(), sender))
            : undefined
        }
      />
      {rule ? <OwnRuleDialog initial={rule} onClose={() => setRule(null)} /> : null}
      {editingCategories ? (
        <CategoryDialog
          accountId={accountId}
          mailbox={mailboxLabel}
          onClose={() => setEditingCategories(false)}
        />
      ) : null}
      {discussing ? (
        <DiscussDialog accountId={accountId} email={email} onClose={() => setDiscussing(false)} />
      ) : null}
      {task ? (
        <TaskDialog starts={[task]} onClose={() => setTask(null)} onArchive={archive} />
      ) : null}
    </div>
  );
};
