/**
 * "Auswertung" on the Telefon page: the last 30 days in numbers – calls in, answered (and how
 * fast), missed, on the mailbox, out – when calls were missed (weekday × hour, the darker the
 * more) and who took them.
 */
import { useQuery } from "@tanstack/react-query";
import { useChatNames } from "@/features/chat/use-chat-names";
import { m } from "@/paraglide/messages";
import type { CallStats } from "../../../server/phone/stats";

const DAYS = [
  m.phone_day_monday,
  m.phone_day_tuesday,
  m.phone_day_wednesday,
  m.phone_day_thursday,
  m.phone_day_friday,
  m.phone_day_saturday,
  m.phone_day_sunday,
];
/** Office hours and a little around them; the rest is shown when something happened there. */
const usualHours = (missedAt: number[][]) => {
  const busy = missedAt.flatMap((row) => row.flatMap((count, hour) => (count ? [hour] : [])));
  const from = Math.min(7, ...busy);
  const to = Math.max(19, ...busy);
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
};

const Tile = ({ label, value }: { label: string; value: string | number }) => (
  <div className="flex flex-col gap-0.5 rounded-lg border border-border px-3 py-2">
    <span className="text-[20px] font-semibold tabular-nums">{value}</span>
    <span className="text-[12px] text-muted">{label}</span>
  </div>
);

export const PhoneStats = () => {
  const { nameOf } = useChatNames();
  const { data } = useQuery({
    queryKey: ["phone", "stats"],
    queryFn: async () => {
      const response = await fetch("/api/phone/stats?days=30", { credentials: "same-origin" });
      if (!response.ok) throw new Error(String(response.status));
      return (await response.json()) as CallStats;
    },
  });
  if (!data) return null;
  const hours = usualHours(data.missedAt);
  const most = Math.max(1, ...data.missedAt.flat());
  return (
    <section aria-label={m.phone_stats()} className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        <Tile label={m.phone_stats_incoming()} value={data.incoming} />
        <Tile label={m.phone_stats_answered()} value={data.answered} />
        <Tile
          label={m.phone_stats_answer_time()}
          value={
            data.answerSeconds === null
              ? "–"
              : m.phone_stats_seconds({ seconds: data.answerSeconds })
          }
        />
        <Tile label={m.phone_stats_missed()} value={data.missed} />
        <Tile label={m.phone_stats_closed()} value={data.closed} />
        <Tile label={m.phone_stats_voicemails()} value={data.voicemails} />
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 text-[13px] font-medium">{m.phone_stats_when()}</h3>
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-0.5 text-[11px] text-muted">
            <thead>
              <tr>
                <th />
                {hours.map((hour) => (
                  <th key={hour} scope="col" className="w-6 font-normal">
                    {hour}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.missedAt.map((row, day) => (
                <tr key={DAYS[day]!()}>
                  <th scope="row" className="pr-1 text-left font-normal">
                    {DAYS[day]!().slice(0, 2)}
                  </th>
                  {hours.map((hour) => (
                    <td
                      key={hour}
                      title={m.phone_stats_cell({ day: DAYS[day]!(), hour, count: row[hour]! })}
                      className="size-6 rounded-[4px] bg-subtle"
                      style={
                        row[hour]
                          ? {
                              background: `color-mix(in srgb, var(--danger) ${20 + (row[hour]! / most) * 80}%, transparent)`,
                            }
                          : undefined
                      }
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {data.byMember.length ? (
        <div className="flex flex-col gap-1">
          <h3 className="m-0 text-[13px] font-medium">{m.phone_stats_who()}</h3>
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0 text-[14px]">
            {data.byMember.map((entry) => (
              <li key={entry.member} className="flex gap-2">
                <span className="flex-1">{nameOf(entry.member)}</span>
                <span className="tabular-nums text-muted">{entry.answered}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
};
