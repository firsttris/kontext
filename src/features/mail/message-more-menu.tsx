/**
 * The reading pane's "Weitere Aktionen": answering, printing and the actions used less often,
 * so the toolbar itself keeps the few used on almost every mail. Each item names its shortcut.
 */
import {
  Download,
  Fish,
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
  UserX,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRoot,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import type { MoveGroup, MoveTarget } from "@/lib/move-targets";
import type { BlockScope } from "@/lib/rules";
import { m } from "@/paraglide/messages";

export type ComposeMode = "reply" | "replyAll" | "forward" | "forwardEml";

/** An item with its key on the right, as the toolbar's titles named it before. */
const Item = ({
  onSelect,
  shortcut,
  children,
}: {
  onSelect: () => void;
  shortcut?: string;
  children: ReactNode;
}) => (
  <MenuItem onSelect={onSelect} aria-keyshortcuts={shortcut}>
    {children}
    {shortcut ? (
      <span aria-hidden="true" className="ml-auto pl-4 text-[12px] text-muted">
        {shortcut}
      </span>
    ) : null}
  </MenuItem>
);

/** "Verschieben nach …": the folders, grouped by mailbox when there are several. */
const MoveSubmenu = ({
  groups,
  onPick,
}: {
  groups: MoveGroup[];
  onPick: (target: MoveTarget) => void;
}) => (
  <MenuSub>
    <MenuSubTrigger>
      <FolderInput size={16} /> {m.mail_move()}
    </MenuSubTrigger>
    <MenuSubContent aria-label={m.mail_move()}>
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
            <MenuItem key={target.mailbox.id} onSelect={() => onPick(target)}>
              {target.label}
            </MenuItem>
          ))}
        </Fragment>
      ))}
    </MenuSubContent>
  </MenuSub>
);

export type BlockSender = { address: string; domain: string; run: (scope: BlockScope) => void };

/** "Absender blockieren": just the address, or everyone from its domain. */
const BlockSubmenu = ({ address, domain, run }: BlockSender) => (
  <MenuSub>
    <MenuSubTrigger>
      <UserX size={16} /> {m.mail_block_sender()}
    </MenuSubTrigger>
    <MenuSubContent aria-label={m.mail_block_sender()}>
      <MenuItem onSelect={() => run("address")}>{m.mail_block_address({ address })}</MenuItem>
      <MenuItem onSelect={() => run("domain")}>{m.mail_block_domain({ domain })}</MenuItem>
    </MenuSubContent>
  </MenuSub>
);

export const MoreMenu = ({
  compose,
  print,
  saveEml,
  markUnread,
  reportPhishing,
  block,
  move,
  categories,
  newTask,
  discuss,
  newRule,
}: {
  compose: (mode: ComposeMode) => void;
  print: () => void;
  /** The whole message as a file (its blob, RFC 8621 §4.1.1). */
  saveEml: () => void;
  /** Left out where the mailbox does not allow it. */
  markUnread?: () => void;
  /** Only where the Firmenverwaltung set a report address. */
  reportPhishing?: () => void;
  /** Only for outside senders, in the own mailbox. */
  block?: BlockSender;
  move?: { groups: MoveGroup[]; onPick: (target: MoveTarget) => void };
  /** The category submenu, where categories may be set. */
  categories?: ReactNode;
  newTask: () => void;
  discuss: () => void;
  newRule?: () => void;
}) => (
  <MenuRoot>
    <MenuTrigger asChild>
      <Button
        variant="ghost"
        size="icon"
        aria-label={m.mail_more()}
        title={m.mail_more()}
        className="shrink-0"
      >
        <MoreHorizontal size={16} />
      </Button>
    </MenuTrigger>
    <MenuContent>
      <Item onSelect={() => compose("reply")} shortcut="r">
        <Reply size={16} /> {m.mail_reply()}
      </Item>
      <Item onSelect={() => compose("replyAll")} shortcut="a">
        <ReplyAll size={16} /> {m.mail_reply_all()}
      </Item>
      <Item onSelect={() => compose("forward")} shortcut="f">
        <Forward size={16} /> {m.mail_forward()}
      </Item>
      <Item onSelect={() => compose("forwardEml")}>
        <Paperclip size={16} /> {m.mail_forward_eml()}
      </Item>
      <Item onSelect={print} shortcut="p">
        <Printer size={16} /> {m.mail_print()}
      </Item>
      <Item onSelect={saveEml}>
        <Download size={16} /> {m.mail_save_eml()}
      </Item>
      {markUnread || reportPhishing || block || move || categories ? <MenuSeparator /> : null}
      {markUnread ? (
        <Item onSelect={markUnread} shortcut="U">
          <MailOpen size={16} /> {m.mail_mark_unread()}
        </Item>
      ) : null}
      {reportPhishing ? (
        <Item onSelect={reportPhishing}>
          <Fish size={16} /> {m.mail_phishing_report()}
        </Item>
      ) : null}
      {block ? <BlockSubmenu {...block} /> : null}
      {move ? <MoveSubmenu groups={move.groups} onPick={move.onPick} /> : null}
      {categories}
      <MenuSeparator />
      <Item onSelect={newTask} shortcut="t">
        <ListChecks size={16} /> {m.tasks_from_mail_title()}
      </Item>
      <Item onSelect={discuss} shortcut="b">
        <MessagesSquare size={16} /> {m.chat_discuss()}
      </Item>
      {newRule ? (
        <Item onSelect={newRule}>
          <ListFilter size={16} /> {m.rules_from_mail()}
        </Item>
      ) : null}
    </MenuContent>
  </MenuRoot>
);
