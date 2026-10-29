/**
 * The calendars the user can see, each with a box to show or hide it: in the sidebar, and in the
 * "Kalender verwalten" dialog with sharing, deleting and creating own calendars, and adding the
 * public holidays.
 */
import { Settings2, Share2, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { StateSelect } from "@/components/state-select";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { principalName } from "@/jmap/principals";
import type { State } from "@/lib/holidays";
import { everyoneAccess, sharedWith } from "@/lib/sharing";
import { m } from "@/paraglide/messages";
import { useColleagues, usePrincipals } from "../sharing/queries";
import { ShareDialog } from "../sharing/share-dialog";
import { DefaultReminderButton } from "./default-reminder";
import { setCalendarHidden } from "./hidden-calendars";
import { useAddHolidays } from "./holiday-queries";
import { type CalendarRef, useCalendarMutations, useCalendarRefs } from "./queries";
import { Subscriptions } from "./subscriptions";
import { TasksToggle } from "./task-chip";

const fail = (toast: ReturnType<typeof useToast>) => (error: Error) =>
  toast.show(m.common_error({ message: error.message }), "error");

/** Sidebar: show/hide, plus the button to manage. */
export const CalendarList = ({ onManage }: { onManage: () => void }) => {
  const { calendars } = useCalendarRefs();
  if (calendars.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center">
        <span className="flex-1 text-[12px] font-medium text-muted">
          {m.calendar_my_calendars()}
        </span>
        <button
          type="button"
          aria-label={m.calendar_manage()}
          title={m.calendar_manage()}
          onClick={onManage}
          className="flex size-6 items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg"
        >
          <Settings2 size={15} />
        </button>
      </div>
      <Rows calendars={calendars.filter((c) => c.isPersonal)} />
      <TasksToggle />
      {calendars.some((c) => !c.isPersonal) ? (
        <>
          <span className="text-[12px] font-medium text-muted">{m.calendar_shared()}</span>
          <Rows calendars={calendars.filter((c) => !c.isPersonal)} />
        </>
      ) : null}
    </div>
  );
};

const Rows = ({ calendars, manage = false }: { calendars: CalendarRef[]; manage?: boolean }) => (
  <ul className="m-0 flex list-none flex-col gap-1 p-0">
    {calendars.map((calendar) => (
      <Row key={calendar.key} calendar={calendar} manage={manage} />
    ))}
  </ul>
);

const Row = ({ calendar, manage }: { calendar: CalendarRef; manage: boolean }) => {
  const visible = calendar.visible;
  return (
    <li className="flex min-h-8 items-center gap-2.5">
      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
        <input
          type="checkbox"
          checked={visible}
          aria-label={m.calendar_show({ name: calendar.name })}
          onChange={(e) => setCalendarHidden(calendar.key, !e.target.checked)}
          className="size-4 shrink-0"
          style={{ accentColor: calendar.color }}
        />
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="truncate">{calendar.name}</span>
          {!calendar.isPersonal ? (
            <span className="truncate text-[12px] text-muted">
              {calendar.name === calendar.owner ? "" : `${calendar.owner} · `}
              {calendar.mayWrite ? m.sharing_may_edit() : m.sharing_read_only()}
            </span>
          ) : manage ? (
            <SharedWith calendar={calendar} />
          ) : null}
        </span>
      </label>
      {manage && calendar.mayWrite ? <DefaultReminderButton calendar={calendar} /> : null}
      {manage && calendar.isPersonal ? <OwnActions calendar={calendar} /> : null}
    </li>
  );
};

const SharedWith = ({ calendar }: { calendar: CalendarRef }) => {
  const { data: principals = [] } = usePrincipals();
  const { colleagues } = useColleagues();
  const shareWith = calendar.calendar.shareWith;
  const names = sharedWith(shareWith).map((id) => {
    const principal = principals.find((p) => p.id === id);
    return principal ? principalName(principal) : id;
  });
  const everyone =
    everyoneAccess(
      shareWith,
      colleagues.map((p) => p.id),
    ) === "availability";
  const parts = [
    names.length ? m.calendar_shared_with({ names: names.join(", ") }) : "",
    everyone ? m.calendar_availability_everyone() : "",
  ].filter(Boolean);
  return (
    <span className="truncate text-[12px] text-muted">
      {parts.length ? parts.join(" · ") : m.calendar_private()}
    </span>
  );
};

const OwnActions = ({ calendar }: { calendar: CalendarRef }) => {
  const { deleteOne, share } = useCalendarMutations();
  const toast = useToast();
  const [sharing, setSharing] = useState(false);

  const destroy = () => {
    if (!window.confirm(m.calendar_delete_confirm({ name: calendar.name }))) return;
    deleteOne.mutate(calendar, { onError: fail(toast) });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setSharing(true)}
        aria-label={`${m.calendar_share()}: ${calendar.name}`}
      >
        <Share2 size={14} /> {m.calendar_share()}
      </Button>
      {!calendar.calendar.isDefault ? (
        <Button
          variant="ghost"
          size="iconSm"
          onClick={destroy}
          aria-label={`${m.calendar_delete()}: ${calendar.name}`}
          title={m.calendar_delete()}
        >
          <Trash2 size={15} />
        </Button>
      ) : null}
      {sharing ? (
        <ShareDialog
          open
          onOpenChange={setSharing}
          title={calendar.name}
          kind="calendar"
          hint={m.sharing_hint_calendar()}
          shareWith={calendar.calendar.shareWith}
          includeInAvailability={calendar.calendar.includeInAvailability !== "none"}
          onSave={async (shareWith, { includeInAvailability }) => {
            await share.mutateAsync({ calendar, shareWith, includeInAvailability });
            toast.show(m.sharing_saved());
          }}
        />
      ) : null}
    </>
  );
};

/** The public holidays of a state into a calendar of their own. */
const Holidays = () => {
  const addHolidays = useAddHolidays();
  const toast = useToast();
  const [state, setState] = useState<State>("BW");

  const add = () =>
    addHolidays.mutate(state, {
      onSuccess: (count) =>
        toast.show(count ? m.calendar_holidays_added({ count }) : m.calendar_holidays_none()),
      onError: fail(toast),
    });

  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-[12px] font-medium text-muted">{m.calendar_holidays()}</h3>
      <p className="m-0 text-[13px] text-muted">{m.calendar_holidays_hint()}</p>
      <div className="flex items-end gap-2">
        <StateSelect value={state} onChange={setState} className="flex-1" />
        <Button variant="outline" onClick={add} disabled={addHolidays.isPending}>
          {m.calendar_holidays_add()}
        </Button>
      </div>
    </section>
  );
};

/** All calendars: show/hide, share and delete own ones, create a new one. */
export const CalendarsDialog = ({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const { calendars } = useCalendarRefs();
  const { createOne } = useCalendarMutations();
  const toast = useToast();
  const [name, setName] = useState("");
  const own = calendars.filter((c) => c.isPersonal);
  const shared = calendars.filter((c) => !c.isPersonal);

  const create = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    createOne.mutate(name.trim(), { onSuccess: () => setName(""), onError: fail(toast) });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={m.calendar_manage()}>
      <section className="flex flex-col gap-2">
        <h3 className="m-0 text-[12px] font-medium text-muted">{m.calendar_my_calendars()}</h3>
        <Rows calendars={own} manage />
        <TasksToggle />
        <form onSubmit={create} className="flex gap-2 pt-1">
          <Input
            aria-label={m.calendar_calendar_name()}
            placeholder={m.calendar_new_calendar()}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="outline" disabled={createOne.isPending || !name.trim()}>
            {m.calendar_create()}
          </Button>
        </form>
      </section>
      <Holidays />
      <Subscriptions />
      {shared.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="m-0 text-[12px] font-medium text-muted">{m.calendar_shared()}</h3>
          <Rows calendars={shared} manage />
        </section>
      ) : null}
    </Dialog>
  );
};
