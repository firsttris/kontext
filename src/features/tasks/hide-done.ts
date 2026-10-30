/**
 * "Erledigte ausblenden" in the tasks' lists and boards: one choice per device, like the hidden
 * calendars (components/stored-set.ts). The view "Erledigt" shows them all the same.
 */
import { storedSet } from "@/components/stored-set";

const hidden = storedSet("kontext.tasks.hidden");

export const useHideDone = (): boolean => hidden.useSet().has("done");

export const setHideDone = (on: boolean) => hidden.set("done", on);
