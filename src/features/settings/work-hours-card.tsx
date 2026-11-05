/** Per device: the working hours the calendar's day and week start at and shade around. */
import { useId } from "react";
import { Select } from "@/components/ui/input";
import { timeLabel } from "@/lib/jscalendar";
import { m } from "@/paraglide/messages";
import { setWorkHours, useWorkHours } from "../calendar/work-hours-setting";
import { SettingsCard } from "./settings-page";

const HOURS = Array.from({ length: 25 }, (_, hour) => hour);

export const WorkHoursCard = () => {
  const hours = useWorkHours();
  const fromId = useId();
  const toId = useId();
  return (
    <SettingsCard title={m.settings_work_hours()} description={m.settings_work_hours_hint()}>
      <div className="flex flex-wrap items-center gap-3 text-[14px]">
        <label htmlFor={fromId}>{m.settings_work_hours_from()}</label>
        <Select
          id={fromId}
          value={hours.startHour}
          onChange={(event) => setWorkHours({ ...hours, startHour: Number(event.target.value) })}
          className="w-auto"
        >
          {HOURS.filter((hour) => hour < hours.endHour).map((hour) => (
            <option key={hour} value={hour}>
              {timeLabel(hour * 60)}
            </option>
          ))}
        </Select>
        <label htmlFor={toId}>{m.settings_work_hours_to()}</label>
        <Select
          id={toId}
          value={hours.endHour}
          onChange={(event) => setWorkHours({ ...hours, endHour: Number(event.target.value) })}
          className="w-auto"
        >
          {HOURS.filter((hour) => hour > hours.startHour).map((hour) => (
            <option key={hour} value={hour}>
              {timeLabel(hour * 60)}
            </option>
          ))}
        </Select>
      </div>
    </SettingsCard>
  );
};
