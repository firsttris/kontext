/** "Feiertage eintragen": finds or creates the state's holiday calendar and adds what's missing. */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useClient } from "@/auth/auth";
import { createCalendar, createEvents, listCalendars, queryEvents } from "@/jmap/calendar";
import type { State } from "@/lib/holidays";
import { dateKey, fromLocal } from "@/lib/jscalendar";
import { holidayCalendarName, holidayEvent, holidayYears, missingHolidays } from "./holidays";
import { listKey, useCalendarAccountId } from "./queries";

/** Resolves to the number of holidays added (0 when all were there). */
export const useAddHolidays = () => {
  const client = useClient();
  const accountId = useCalendarAccountId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (state: State): Promise<number> => {
      const name = holidayCalendarName(state);
      const calendarId =
        (await listCalendars(client, accountId!)).find((calendar) => calendar.name === name)?.id ??
        (await createCalendar(client, accountId!, { name }));
      const years = holidayYears(dateKey(new Date()));
      const existing = await queryEvents(
        client,
        accountId!,
        fromLocal(`${years[0]}-01-01T00:00:00`),
        fromLocal(`${years[1] + 1}-01-01T00:00:00`),
        { calendarId },
      );
      const missing = missingHolidays(state, years, existing);
      await createEvents(client, accountId!, calendarId, missing.map(holidayEvent));
      return missing.length;
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: listKey(accountId!) }),
        queryClient.invalidateQueries({ queryKey: [accountId, "events"] }),
      ]),
  });
};
