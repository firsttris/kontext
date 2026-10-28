/** The app's language on this device: as the browser says, or German or English. */
import { useId } from "react";
import { Select } from "@/components/ui/input";
import { chooseLanguage, chosenLanguage } from "@/lib/locale";
import { m } from "@/paraglide/messages";
import { getLocale, isLocale, type Locale } from "@/paraglide/runtime";
import { SettingsCard } from "./settings-page";

/** Each language in its own words, so the way back is readable whatever is set. */
const LANGUAGES: [Locale, string][] = [
  ["de", "Deutsch"],
  ["en", "English"],
];

const SYSTEM = "system";

export const LanguageCard = () => {
  const id = useId();
  const current = LANGUAGES.find(([locale]) => locale === getLocale())?.[1] ?? "";
  return (
    <SettingsCard title={m.settings_language()} description={m.settings_language_hint()}>
      <div className="flex items-center justify-between gap-3 text-[14px]">
        <label htmlFor={id}>{m.settings_language()}</label>
        <Select
          id={id}
          value={chosenLanguage() ?? SYSTEM}
          onChange={({ target }) =>
            chooseLanguage(isLocale(target.value) ? target.value : undefined)
          }
          className="w-auto"
        >
          <option value={SYSTEM}>{m.settings_language_system({ language: current })}</option>
          {LANGUAGES.map(([locale, name]) => (
            <option key={locale} value={locale}>
              {name}
            </option>
          ))}
        </Select>
      </div>
    </SettingsCard>
  );
};
