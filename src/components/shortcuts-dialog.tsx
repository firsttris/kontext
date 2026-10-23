/** "?": all keyboard shortcuts, grouped by app. */
import { Dialog } from "@/components/ui/dialog";
import { SHORTCUTS, type ShortcutGroup } from "@/lib/shortcuts";
import { m } from "@/paraglide/messages";

const GROUPS: [ShortcutGroup, () => string][] = [
  ["general", m.shortcuts_group_general],
  ["mail", m.shortcuts_group_mail],
  ["calendar", m.shortcuts_group_calendar],
  ["contacts", m.shortcuts_group_contacts],
];

/** The description of a shortcut's action, from the messages ("shortcuts_reply" …). */
const actionLabel = (action: string): string =>
  (m as unknown as Record<string, () => string>)[`shortcuts_${action}`]?.() ?? action;

export const ShortcutList = () => (
  <div className="grid gap-5 sm:grid-cols-2">
    {GROUPS.map(([group, title]) => (
      <section key={group} className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[12px] font-medium text-muted">{title()}</h3>
        <dl className="m-0 flex flex-col gap-1">
          {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
            <div key={shortcut.action} className="flex items-center justify-between gap-3">
              <dt className="text-[14px]">{actionLabel(shortcut.action)}</dt>
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
