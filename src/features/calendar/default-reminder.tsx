/**
 * "Erinnerung" for a calendar in Kalender verwalten: the reminder a new appointment in it gets,
 * one for appointments with a time and one for all-day ones. Stalwart keeps them per person on
 * the calendar (`defaultAlertsWithTime`, `defaultAlertsWithoutTime`; crates/jmap/src/calendar/
 * set.rs); the event editor fills them in (lib/reminders.ts `defaultReminder`).
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useClient } from "@/auth/auth";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { updateCalendar } from "@/jmap/calendar";
import { withOwnVisibility } from "@/lib/calendar-visibility";
import { defaultAlertsOf, type Reminder, type ReminderChoice, reminderOf } from "@/lib/reminders";
import { m } from "@/paraglide/messages";
import { type CalendarRef, listKey } from "./queries";
import { ReminderFields } from "./reminder-fields";

/** A stored default as the form shows it; several alerts or an odd one read as none. */
const choiceOf = (alerts: CalendarRef["calendar"]["defaultAlertsWithTime"]): Reminder | null => {
  const choice = reminderOf(alerts);
  return choice === "kept" ? null : choice;
};

const plain = (choice: ReminderChoice): Reminder | null => (choice === "kept" ? null : choice);

export const DefaultReminderButton = ({ calendar }: { calendar: CalendarRef }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="iconSm"
        onClick={() => setOpen(true)}
        aria-label={`${m.calendar_default_reminder()}: ${calendar.name}`}
        title={m.calendar_default_reminder()}
      >
        <Bell size={15} />
      </Button>
      {open ? <DefaultReminderDialog calendar={calendar} onClose={() => setOpen(false)} /> : null}
    </>
  );
};

const DefaultReminderDialog = ({
  calendar,
  onClose,
}: {
  calendar: CalendarRef;
  onClose: () => void;
}) => {
  const client = useClient();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [timed, setTimed] = useState(() => choiceOf(calendar.calendar.defaultAlertsWithTime));
  const [allDay, setAllDay] = useState(() => choiceOf(calendar.calendar.defaultAlertsWithoutTime));
  const save = useMutation({
    mutationFn: () =>
      updateCalendar(
        client,
        calendar.accountId,
        calendar.calendar.id,
        withOwnVisibility(
          {
            defaultAlertsWithTime: defaultAlertsOf(timed),
            defaultAlertsWithoutTime: defaultAlertsOf(allDay),
          },
          calendar.visible,
        ),
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: listKey(calendar.accountId) });
      toast.show(m.calendar_default_reminder_saved());
      onClose();
    },
    onError: (error) => toast.show(m.common_error({ message: error.message }), "error"),
  });
  return (
    <Dialog
      open
      onOpenChange={(next) => (next ? null : onClose())}
      title={m.calendar_default_reminder_title({ name: calendar.name })}
      description={m.calendar_default_reminder_hint()}
    >
      <ReminderFields
        value={timed}
        allDay={false}
        onChange={(choice) => setTimed(plain(choice))}
        label={m.calendar_default_reminder_timed()}
        noneLabel={m.calendar_default_reminder_usual()}
        howLabel={`${m.calendar_reminder_how()} (${m.calendar_default_reminder_timed()})`}
      />
      <ReminderFields
        value={allDay}
        allDay
        onChange={(choice) => setAllDay(plain(choice))}
        label={m.calendar_default_reminder_all_day()}
        howLabel={`${m.calendar_reminder_how()} (${m.calendar_default_reminder_all_day()})`}
      />
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {m.calendar_event_cancel()}
        </Button>
        <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
          {m.calendar_event_save()}
        </Button>
      </div>
    </Dialog>
  );
};
