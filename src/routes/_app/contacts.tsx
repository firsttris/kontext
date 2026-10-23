import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ContactsPage } from "@/features/contacts/contacts-page";

export const Route = createFileRoute("/_app/contacts")({
  validateSearch: z.object({
    /** The open contact, or "new". */
    id: z.string().optional(),
    /** The account of the open contact when it is not the user's own (a shared address book). */
    account: z.string().optional(),
    /** Only this address book (`accountId:bookId`). */
    book: z.string().optional(),
    edit: z.boolean().optional(),
    q: z.string().optional(),
  }),
  component: ContactsRoute,
});

function ContactsRoute() {
  return <ContactsPage search={Route.useSearch()} />;
}
