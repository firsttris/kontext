import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ContactsPage } from "@/features/contacts/contacts-page";

export const Route = createFileRoute("/_app/contacts")({
  validateSearch: z.object({
    id: z.string().optional(),
    edit: z.boolean().optional(),
    q: z.string().optional(),
  }),
  component: ContactsRoute,
});

function ContactsRoute() {
  return <ContactsPage search={Route.useSearch()} />;
}
