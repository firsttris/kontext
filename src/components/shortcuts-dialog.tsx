/** "?": all keyboard shortcuts, grouped by app. */
import { Dialog } from "@/components/ui/dialog";
import { SHORTCUTS, type ShortcutAction, type ShortcutGroup } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages";

const GROUPS: [ShortcutGroup, () => string][] = [
  ["general", m.shortcuts_group_general],
  ["mail", m.shortcuts_group_mail],
  ["calendar", m.shortcuts_group_calendar],
  ["contacts", m.shortcuts_group_contacts],
];

/**
 * The description of each shortcut's action. Named one by one: a computed `m[…]` would keep
 * every message in the chunk of every page (src/messages-usage.test.ts).
 */
const ACTION_LABELS: Record<ShortcutAction, () => string> = {
  help: m.shortcuts_help,
  apps: m.shortcuts_apps,
  compose: m.shortcuts_compose,
  send: m.shortcuts_send,
  search: m.shortcuts_search,
  nextPrev: m.shortcuts_nextPrev,
  reply: m.shortcuts_reply,
  replyAll: m.shortcuts_replyAll,
  forward: m.shortcuts_forward,
  archive: m.shortcuts_archive,
  snooze: m.shortcuts_snooze,
  delete: m.shortcuts_delete,
  flag: m.shortcuts_flag,
  spam: m.shortcuts_spam,
  unread: m.shortcuts_unread,
  select: m.shortcuts_select,
  print: m.shortcuts_print,
  newTask: m.shortcuts_newTask,
  discuss: m.shortcuts_discuss,
  close: m.shortcuts_close,
  newEvent: m.shortcuts_newEvent,
  today: m.shortcuts_today,
  prevNext: m.shortcuts_prevNext,
  views: m.shortcuts_views,
  newContact: m.shortcuts_newContact,
};

export const ShortcutList = () => (
  <div className="grid gap-5 sm:grid-cols-2">
    {GROUPS.map(([group, title]) => (
      <section key={group} className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[12px] font-medium text-muted">{title()}</h3>
        <dl className="m-0 flex flex-col gap-1">
          {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
            <div key={shortcut.action} className="flex items-center justify-between gap-3">
              <dt className="text-[14px]">{ACTION_LABELS[shortcut.action]()}</dt>
              <dd className="m-0 flex gap-1">
                {shortcut.keys.map((key) => (
                  <kbd
                    key={key}
                    className="min-w-6 rounded-md border border-border bg-subtle px-1.5 py-0.5 text-center font-mono text-[12px]"
                  >
                    {key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    ))}
  </div>
);

export const ShortcutsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => (
  <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title={m.shortcuts_title()}
    description={m.shortcuts_hint()}
    className="md:w-[min(680px,calc(100vw-32px))]"
  >
    <ShortcutList />
  </Dialog>
);
