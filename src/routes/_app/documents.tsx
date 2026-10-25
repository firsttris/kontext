import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useDocumentsUrl } from "@/features/documents/queries";
import { m } from "@/paraglide/messages";

/**
 * The module "Dokumente": Schreibzeug in a frame that lives beside the pages
 * (features/documents/documents-host.tsx), so the route itself shows nothing of its own.
 */
export const Route = createFileRoute("/_app/documents")({ component: DocumentsRoute });

function DocumentsRoute() {
  const url = useDocumentsUrl();
  if (url) return <Outlet />;
  return (
    <main className="flex flex-1 items-center justify-center p-8 text-[14px] text-muted">
      {m.documents_missing()}
    </main>
  );
}
