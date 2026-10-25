/**
 * Pictures from the internet by sender: whom one trusts – an address, a whole domain ("@firma.de")
 * or everyone in one's contacts ("@contacts"). Pure, for the app and the server.
 */
import { z } from "zod";

export const CONTACTS = "@contacts";

/** An address or "@domain", in lower case; "@contacts" as it is. */
export const senderSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .regex(/^(@contacts|[^\s@]+@[^\s@]+\.[^\s@]+|@[^\s@]+\.[^\s@]+)$/);

/** Whether pictures of mails from this address load at once. */
export const trusts = (list: string[], address: string, inContacts: boolean): boolean => {
  const lower = address.trim().toLowerCase();
  const domain = lower.split("@")[1] ?? "";
  return (
    list.includes(lower) ||
    (domain !== "" && list.includes(`@${domain}`)) ||
    (inContacts && list.includes(CONTACTS))
  );
};
