/**
 * Which apps the phone's tab bar shows: the person's choice (per device), as far as those apps
 * are there for them, filled up with the default; everything else stays under "Mehr".
 */

/** As many apps as fit beside "Mehr" on a narrow phone. */
export const TAB_SLOTS = 4;

/** The four used most, as before the choice existed. */
export const DEFAULT_TABS: readonly string[] = ["/mail", "/calendar", "/chat", "/tasks"];

const unique = (list: readonly string[]) => [...new Set(list)];

/**
 * The tab bar for the apps `available` (in their order): the stored choice where an app is still
 * there (a stale or foreign entry is dropped), then the defaults, then the rest, `slots` at most.
 */
export const tabBarModules = (
  stored: readonly string[] | null,
  available: readonly string[],
  slots = TAB_SLOTS,
  defaults: readonly string[] = DEFAULT_TABS,
): string[] =>
  unique([...(stored ?? []), ...defaults, ...available])
    .filter((to) => available.includes(to))
    .slice(0, slots);

/** The apps under "Mehr": those available that are not in the tab bar, in their order. */
export const moreModules = (available: readonly string[], tabs: readonly string[]): string[] =>
  available.filter((to) => !tabs.includes(to));

/**
 * Puts `to` into slot `slot`; if it already sat in another slot, the two swap places, so no app
 * is shown twice and none gets lost.
 */
export const placeTab = (tabs: readonly string[], slot: number, to: string): string[] => {
  const from = tabs.indexOf(to);
  return tabs.map((entry, index) => {
    if (index === slot) return to;
    return index === from ? (tabs[slot] ?? entry) : entry;
  });
};

/** Whether these are the default tabs for the apps (then "Zurücksetzen" has nothing to do). */
export const isDefaultTabs = (tabs: readonly string[], available: readonly string[]): boolean =>
  tabBarModules(null, available, tabs.length).join() === tabs.join();
