/**
 * Per device: light or dark, Kontext as an app, notifications; and the keyboard shortcuts for
 * reference.
 */
import { Monitor, Moon, Sun } from "lucide-react";
import { ShortcutList } from "@/components/shortcuts-dialog";
import { setThemeChoice, useTheme } from "@/components/theme/use-theme";
import { cn } from "@/lib/cn";
import type { ThemeChoice } from "@/lib/theme";
import { m } from "@/paraglide/messages";
import { DeviceSwitch } from "../notifications/device-switch";
import { AppSection } from "./app-section";
import { SettingsCard } from "./settings-page";

const CHOICES: [ThemeChoice, () => string, typeof Sun][] = [
  ["system", m.settings_theme_system, Monitor],
  ["light", m.settings_theme_light, Sun],
  ["dark", m.settings_theme_dark, Moon],
];

export const AppearanceSection = () => {
  const { choice } = useTheme();
  return (
    <>
      <SettingsCard title={m.settings_theme()} description={m.settings_theme_hint()}>
        <fieldset className="m-0 grid grid-cols-3 gap-2 border-0 p-0">
          <legend className="sr-only">{m.settings_theme()}</legend>
          {CHOICES.map(([value, label, Icon]) => (
            <label
              key={value}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-2 rounded-xl border px-3 py-4 text-[14px]",
                choice === value ? "border-fg bg-subtle font-medium" : "border-border",
              )}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={choice === value}
                onChange={() => setThemeChoice(value)}
                className="sr-only"
              />
              <Icon size={20} strokeWidth={1.75} />
              {label()}
            </label>
          ))}
        </fieldset>
      </SettingsCard>
      <AppSection />
      <SettingsCard title={m.notifications_title()}>
        <DeviceSwitch />
      </SettingsCard>
      <SettingsCard title={m.shortcuts_title()} description={m.shortcuts_hint()}>
        <ShortcutList />
      </SettingsCard>
    </>
  );
};
