/** The suggestions of the To field and the attendee field: colleagues, contact groups, contacts. */
import { useMemo } from "react";
import { groupSuggestions, type Suggestion } from "@/lib/groups";
import { contactAddresses } from "@/lib/jscontact";
import { colleagueAddresses, mergeSuggestions } from "@/lib/suggestions";
import { useColleagues } from "../sharing/queries";
import { useContacts } from "./queries";

export const useAddressSuggestions = (): Suggestion[] => {
  const { data: contacts = [] } = useContacts();
  const { colleagues } = useColleagues();
  return useMemo(
    () =>
      mergeSuggestions(
        colleagueAddresses(colleagues),
        groupSuggestions(contacts),
        contactAddresses(contacts),
      ),
    [colleagues, contacts],
  );
};
