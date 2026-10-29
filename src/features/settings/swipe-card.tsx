/** Per device: what swiping a mail in the list to the left or right does on the phone. */
import { useId } from "react";
import { Select } from "@/components/ui/input";
import { SWIPE_ACTIONS, type SwipeAction, type SwipeDirection } from "@/lib/swipe";
import { m } from "@/paraglide/messages";
import { setSwipeSettings, useSwipeSettings } from "../mail/swipe-settings";
import { SettingsCard } from "./settings-page";

const ACTION_LABEL: Record<SwipeAction, () => string> = {
  archive: m.settings_swipe_archive,
  delete: m.settings_swipe_delete,
  read: m.settings_swipe_read,
  flag: m.settings_swipe_flag,
  none: m.settings_swipe_none,
};

const DIRECTIONS: [SwipeDirection, () => string][] = [
  ["left", m.settings_swipe_left],
  ["right", m.settings_swipe_right],
];

export const SwipeCard = () => {
  const settings = useSwipeSettings();
  const id = useId();
  return (
    <SettingsCard title={m.settings_swipe()} description={m.settings_swipe_hint()}>
      {DIRECTIONS.map(([direction, label]) => (
        <div key={direction} className="flex items-center justify-between gap-3 text-[14px]">
          <label htmlFor={`${id}-${direction}`}>{label()}</label>
          <Select
            id={`${id}-${direction}`}
            value={settings[direction]}
            onChange={(event) =>
              setSwipeSettings({ ...settings, [direction]: event.target.value as SwipeAction })
            }
            className="w-44"
          >
            {SWIPE_ACTIONS.map((action) => (
              <option key={action} value={action}>
                {ACTION_LABEL[action]()}
              </option>
            ))}
          </Select>
        </div>
      ))}
    </SettingsCard>
  );
};
