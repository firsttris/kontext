/**
 * Which apps the phone's tab bar shows, per device: one choice per place; picking an app that
 * already has a place swaps the two, so none is shown twice.
 */
import { RotateCcw } from "lucide-react";
import { useMoreItems, usePhoneApps, useTabItems } from "@/components/shell/nav-items";
import { setTabChoice } from "@/components/shell/tab-bar-settings";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { isDefaultTabs, placeTab } from "@/lib/tab-bar";
import { m } from "@/paraglide/messages";
import { SettingsCard } from "./settings-page";

export const TabBarSection = () => {
  const apps = usePhoneApps();
  const tabs = useTabItems().map((item) => item.to);
  const more = useMoreItems();
  return (
    <SettingsCard title={m.settings_tab_bar()} description={m.settings_tab_bar_hint()}>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {tabs.map((current, slot) => (
          // The places are fixed: keyed by place, the select keeps focus when its app changes.
          // biome-ignore lint/suspicious/noArrayIndexKey: the index is the place
          <li key={slot} className="flex items-center justify-between gap-3 text-[14px]">
            <span className="text-muted">{m.settings_tab_bar_slot({ slot: slot + 1 })}</span>
            <Select
              aria-label={m.settings_tab_bar_slot_label({ slot: slot + 1 })}
              value={current}
              onChange={(event) => setTabChoice(placeTab(tabs, slot, event.target.value))}
              className="w-44"
            >
              {apps.map(({ to, label }) => (
                <option key={to} value={to}>
                  {label()}
                </option>
              ))}
            </Select>
          </li>
        ))}
      </ol>
      {more.length > 0 ? (
        <p className="m-0 text-[12px] text-muted">
          {m.settings_tab_bar_more({ apps: more.map(({ label }) => label()).join(", ") })}
        </p>
      ) : null}
      <Button
        className="self-start"
        disabled={isDefaultTabs(
          tabs,
          apps.map((app) => app.to),
        )}
        onClick={() => setTabChoice(null)}
      >
        <RotateCcw size={15} /> {m.settings_tab_bar_reset()}
      </Button>
    </SettingsCard>
  );
};
