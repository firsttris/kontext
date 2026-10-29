/** The German state whose public holidays to add: in the calendar and the phone's opening hours. */
import { Label, Select } from "@/components/ui/input";
import { STATES, type State } from "@/lib/holidays";
import { m } from "@/paraglide/messages";

export const StateSelect = ({
  value,
  onChange,
  className,
}: {
  value: State;
  onChange: (state: State) => void;
  className?: string;
}) => (
  <Label className={className}>
    {m.holidays_state()}
    <Select value={value} onChange={(e) => onChange(e.target.value as State)}>
      {Object.entries(STATES).map(([code, name]) => (
        <option key={code} value={code}>
          {name}
        </option>
      ))}
    </Select>
  </Label>
);
